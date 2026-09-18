import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { env } from "../_generated/server";
import { withSystemFields, z, zid, zInternalAction, zInternalMutation, zInternalQuery } from "../lib/z";
import { boardFields } from "../boards/_schema";
import { pollResultFields } from "../pollResults/_schema";
import { renderHtml, renderMarkdown } from "./_render";
import { exportKind, exportStatus } from "./_schema";

const FETCH_TIMEOUT_MS = 15_000;

const boardDoc = z.object(withSystemFields("boards", boardFields));
const resultsDoc = z.object(withSystemFields("pollResults", pollResultFields));

function siteUrl() {
  return env.SITE_URL ?? "http://localhost:3000";
}

type CloudflareSendResponse = {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
};

export const record = zInternalMutation({
  args: {
    boardId: zid("boards"),
    resultsId: zid("pollResults"),
    kind: exportKind,
    status: exportStatus,
    target: z.string(),
    externalUrl: z.string().optional(),
    error: z.string().optional(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("exports", args);
    return null;
  },
});

/** Loads a results snapshot and asserts `userId` owns its board. */
export const loadForExport = zInternalQuery({
  args: { resultsId: zid("pollResults"), userId: zid("users") },
  returns: z.object({ results: resultsDoc, board: boardDoc }),
  handler: async (ctx, { resultsId, userId }) => {
    const results = await ctx.db.get(resultsId);
    if (results === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Results not found" });
    }
    const board = await ctx.db.get(results.boardId);
    if (board === null || board.creatorId !== userId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not your board" });
    }
    return { results, board };
  },
});

export const sendEmail = zInternalAction({
  args: {
    resultsId: zid("pollResults"),
    userId: zid("users"),
    to: z.string(),
  },
  returns: z.null(),
  handler: async (ctx, { resultsId, userId, to }) => {
    const { results, board } = await ctx.runQuery(
      internal.exports.internal.loadForExport,
      { resultsId, userId },
    );
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const token = env.CLOUDFLARE_EMAIL_API_TOKEN;
    const from = env.EMAIL_FROM;
    let outcome: { ok: boolean; error?: string };
    if (!accountId || !token || !from) {
      outcome = {
        ok: false,
        error:
          "Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL_API_TOKEN or EMAIL_FROM env vars.",
      };
    } else {
      try {
        const res = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to,
              from: { address: from, name: board.title },
              subject: `Poll results: ${results.question}`,
              html: renderHtml(board, results, siteUrl()),
              text: renderMarkdown(board, results, siteUrl()),
            }),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          },
        );
        const json = (await res.json()) as CloudflareSendResponse;
        if (!res.ok || json.success === false) {
          const error =
            json.errors
              ?.map((err) =>
                err.code !== undefined
                  ? `${err.code}: ${err.message ?? ""}`
                  : (err.message ?? ""),
              )
              .filter((s) => s.length > 0)
              .join("; ") || `HTTP ${res.status}`;
          outcome = { ok: false, error };
        } else {
          outcome = { ok: true };
        }
      } catch (e) {
        outcome = {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
    await ctx.runMutation(internal.exports.internal.record, {
      boardId: board._id,
      resultsId,
      kind: "email",
      status: outcome.ok ? "sent" : "failed",
      target: to,
      error: outcome.error,
    });
    return null;
  },
});

export const sendLinear = zInternalAction({
  args: { resultsId: zid("pollResults"), userId: zid("users") },
  returns: z.null(),
  handler: async (ctx, { resultsId, userId }) => {
    const { results, board } = await ctx.runQuery(
      internal.exports.internal.loadForExport,
      { resultsId, userId },
    );
    const apiKey = env.LINEAR_API_KEY;
    const teamId = env.LINEAR_TEAM_ID;
    let outcome: { ok: boolean; externalUrl?: string; error?: string };
    if (!apiKey || !teamId) {
      outcome = {
        ok: false,
        error: "Missing LINEAR_API_KEY or LINEAR_TEAM_ID env vars.",
      };
    } else {
      try {
        const res = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            Authorization: apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `mutation($input: IssueCreateInput!) {
            issueCreate(input: $input) { success issue { id identifier url } }
          }`,
            variables: {
              input: {
                teamId,
                title: `[${board.title}] ${results.question}`,
                description: renderMarkdown(board, results, siteUrl()),
              },
            },
          }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        const json = (await res.json()) as {
          data?: {
            issueCreate?: { success: boolean; issue?: { url: string } };
          };
          errors?: Array<{ message: string }>;
        };
        const issue = json.data?.issueCreate;
        outcome =
          issue?.success && issue.issue
            ? { ok: true, externalUrl: issue.issue.url }
            : {
                ok: false,
                error:
                  json.errors?.map((e) => e.message).join("; ") ||
                  `HTTP ${res.status}`,
              };
      } catch (e) {
        outcome = {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
    await ctx.runMutation(internal.exports.internal.record, {
      boardId: board._id,
      resultsId,
      kind: "linear",
      status: outcome.ok ? "sent" : "failed",
      target: `team ${teamId ?? "unset"}`,
      externalUrl: outcome.externalUrl,
      error: outcome.error,
    });
    return null;
  },
});
