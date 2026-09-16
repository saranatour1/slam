import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { requireBoardOwner } from "./lib/auth";
import schema from "./schema";

const FETCH_TIMEOUT_MS = 15_000;

const boardDoc = v.object({
  ...schema.tables.boards.validator.fields,
  _id: v.id("boards"),
  _creationTime: v.number(),
});
const resultsDoc = v.object({
  ...schema.tables.pollResults.validator.fields,
  _id: v.id("pollResults"),
  _creationTime: v.number(),
});

/** Loads a results snapshot and asserts `userId` owns its board. */
export const loadForExport = internalQuery({
  args: { resultsId: v.id("pollResults"), userId: v.id("users") },
  returns: v.object({ results: resultsDoc, board: boardDoc }),
  handler: async (ctx, { resultsId, userId }) => {
    const results = await ctx.db.get(resultsId);
    if (results === null) throw new ConvexError({ code: "NOT_FOUND", message: "Results not found" });
    const board = await ctx.db.get(results.boardId);
    if (board === null || board.creatorId !== userId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not your board" });
    }
    return { results, board };
  },
});

export const record = internalMutation({
  args: {
    boardId: v.id("boards"),
    resultsId: v.id("pollResults"),
    kind: v.union(v.literal("linear"), v.literal("email")),
    status: v.union(v.literal("sent"), v.literal("failed")),
    target: v.string(),
    externalUrl: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("exports", args);
    return null;
  },
});

async function assertOwner(ctx: MutationCtx, resultsId: Id<"pollResults">) {
  const results = await ctx.db.get(resultsId);
  if (results === null) throw new ConvexError({ code: "NOT_FOUND", message: "Results not found" });
  const { user, board } = await requireBoardOwner(ctx, results.boardId);
  return { user, results, board };
}

function renderMarkdown(board: Doc<"boards">, r: Doc<"pollResults">, siteUrl: string) {
  const lines: string[] = [];
  lines.push(`# ${board.title} — poll results`);
  lines.push("");
  lines.push(`**Question:** ${r.question}`);
  lines.push(`**Closed:** ${new Date(r.closedAt).toISOString()}`);
  lines.push(`**Votes:** ${r.totalVotes} from ${r.participants} participants`);
  lines.push("");
  lines.push("## Poll");
  for (const t of [...r.totals].sort((a, b) => b.count - a.count)) {
    const pct = r.totalVotes === 0 ? 0 : Math.round((t.count / r.totalVotes) * 100);
    lines.push(`- ${t.label}: **${t.count}** (${pct}%)`);
  }
  lines.push("");
  lines.push("## Ideas (by score)");
  for (const i of r.ideas) {
    lines.push(`- ${i.title}: ${i.score >= 0 ? "+" : ""}${i.score} (▲${i.up} ▼${i.down}, ${i.comments} comments)`);
  }
  lines.push("");
  lines.push(`Board: ${siteUrl}/b/${board.slug}`);
  return lines.join("\n");
}

function renderHtml(board: Doc<"boards">, r: Doc<"pollResults">, siteUrl: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const pollRows = [...r.totals]
    .sort((a, b) => b.count - a.count)
    .map((t) => {
      const pct = r.totalVotes === 0 ? 0 : Math.round((t.count / r.totalVotes) * 100);
      return `<tr><td>${esc(t.label)}</td><td><b>${t.count}</b></td><td>${pct}%</td></tr>`;
    })
    .join("");
  const ideaRows = r.ideas
    .map((i) => `<tr><td>${esc(i.title)}</td><td><b>${i.score}</b></td><td>${i.up}</td><td>${i.down}</td><td>${i.comments}</td></tr>`)
    .join("");
  return `<!doctype html><html><body style="font-family:sans-serif;max-width:640px">
<h1>${esc(board.title)} — poll results</h1>
<p><b>Question:</b> ${esc(r.question)}<br/><b>Closed:</b> ${new Date(r.closedAt).toUTCString()}<br/>
<b>Votes:</b> ${r.totalVotes} from ${r.participants} participants</p>
<h2>Poll</h2><table border="1" cellpadding="6" cellspacing="0"><tr><th>Option</th><th>Votes</th><th>%</th></tr>${pollRows}</table>
<h2>Ideas (by score)</h2><table border="1" cellpadding="6" cellspacing="0"><tr><th>Idea</th><th>Score</th><th>▲</th><th>▼</th><th>Comments</th></tr>${ideaRows}</table>
<p><a href="${esc(siteUrl)}/b/${esc(board.slug)}">Open the board</a></p>
</body></html>`;
}

function siteUrl() {
  return env.SITE_URL ?? "http://localhost:3000";
}

/**
 * Authorize on a mutation (session is available here), then send from an
 * internal action. Client-called actions do not see Convex Auth v2 identity.
 */
export const emailResults = mutation({
  args: { resultsId: v.id("pollResults"), to: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { resultsId, to }) => {
    const { user, board } = await assertOwner(ctx, resultsId);
    const recipient = to?.trim() || board.notifyEmail;
    if (!recipient) {
      throw new ConvexError({ code: "INVALID", message: "Set a notify email on the board first." });
    }
    await ctx.scheduler.runAfter(0, internal.exports.sendEmail, {
      resultsId,
      userId: user._id,
      to: recipient,
    });
    return null;
  },
});

export const sendEmail = internalAction({
  args: {
    resultsId: v.id("pollResults"),
    userId: v.id("users"),
    to: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { resultsId, userId, to }) => {
    const { results, board } = await ctx.runQuery(internal.exports.loadForExport, { resultsId, userId });
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const token = env.CLOUDFLARE_EMAIL_API_TOKEN;
    const from = env.EMAIL_FROM;
    let outcome: { ok: boolean; error?: string };
    if (!accountId || !token || !from) {
      outcome = {
        ok: false,
        error: "Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL_API_TOKEN or EMAIL_FROM env vars.",
      };
    } else {
      try {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            to,
            from,
            subject: `Poll results: ${results.question}`,
            html: renderHtml(board, results, siteUrl()),
            text: renderMarkdown(board, results, siteUrl()),
          }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        const json = (await res.json()) as {
          success?: boolean;
          errors?: Array<{ code: number; message: string }>;
        };
        outcome = json.success
          ? { ok: true }
          : { ok: false, error: json.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") || `HTTP ${res.status}` };
      } catch (e) {
        outcome = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    await ctx.runMutation(internal.exports.record, {
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

export const linearResults = mutation({
  args: { resultsId: v.id("pollResults") },
  returns: v.null(),
  handler: async (ctx, { resultsId }) => {
    const { user } = await assertOwner(ctx, resultsId);
    await ctx.scheduler.runAfter(0, internal.exports.sendLinear, { resultsId, userId: user._id });
    return null;
  },
});

export const sendLinear = internalAction({
  args: { resultsId: v.id("pollResults"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { resultsId, userId }) => {
    const { results, board } = await ctx.runQuery(internal.exports.loadForExport, { resultsId, userId });
    const apiKey = env.LINEAR_API_KEY;
    const teamId = env.LINEAR_TEAM_ID;
    let outcome: { ok: boolean; externalUrl?: string; error?: string };
    if (!apiKey || !teamId) {
      outcome = { ok: false, error: "Missing LINEAR_API_KEY or LINEAR_TEAM_ID env vars." };
    } else {
      try {
        const res = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: { Authorization: apiKey, "Content-Type": "application/json" },
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
          data?: { issueCreate?: { success: boolean; issue?: { url: string } } };
          errors?: Array<{ message: string }>;
        };
        const issue = json.data?.issueCreate;
        outcome =
          issue?.success && issue.issue
            ? { ok: true, externalUrl: issue.issue.url }
            : { ok: false, error: json.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}` };
      } catch (e) {
        outcome = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    await ctx.runMutation(internal.exports.record, {
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
