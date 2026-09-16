import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/core";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  env,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";

const FETCH_TIMEOUT_MS = 15_000;

const exportOutcome = v.object({
  ok: v.boolean(),
  externalUrl: v.optional(v.string()),
  error: v.optional(v.string()),
});

/** Loads a results snapshot and asserts `userId` owns its board. */
export const loadForExport = internalQuery({
  args: { resultsId: v.id("pollResults"), userId: v.id("users") },
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

async function authorize(ctx: ActionCtx, resultsId: Id<"pollResults">) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in first" });
  return await ctx.runQuery(internal.exports.loadForExport, { resultsId, userId });
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

/** Email the frozen results to the board's notify address via Cloudflare Email Sending. */
export const emailResults = action({
  args: { resultsId: v.id("pollResults"), to: v.optional(v.string()) },
  returns: exportOutcome,
  handler: async (ctx, { resultsId, to }) => {
    const { results, board } = await authorize(ctx, resultsId);
    const recipient = to?.trim() || board.notifyEmail;
    if (!recipient) {
      return { ok: false, error: "Set a notify email on the board first." };
    }
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const token = env.CLOUDFLARE_EMAIL_API_TOKEN;
    const from = env.EMAIL_FROM;
    if (!accountId || !token || !from) {
      return {
        ok: false,
        error: "Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL_API_TOKEN or EMAIL_FROM env vars.",
      };
    }

    let outcome: { ok: boolean; error?: string };
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            to: recipient,
            from: { address: from, name: board.title },
            subject: `Poll results: ${results.question}`,
            html: renderHtml(board, results, siteUrl()),
            text: renderMarkdown(board, results, siteUrl()),
          }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        },
      );
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

    await ctx.runMutation(internal.exports.record, {
      boardId: board._id,
      resultsId,
      kind: "email",
      status: outcome.ok ? "sent" : "failed",
      target: recipient,
      error: outcome.error,
    });
    return outcome;
  },
});

/** Create a Linear issue holding the frozen results (personal API key auth). */
export const linearResults = action({
  args: { resultsId: v.id("pollResults") },
  returns: exportOutcome,
  handler: async (ctx, { resultsId }) => {
    const { results, board } = await authorize(ctx, resultsId);
    const apiKey = env.LINEAR_API_KEY;
    const teamId = env.LINEAR_TEAM_ID;
    if (!apiKey || !teamId) {
      return { ok: false, error: "Missing LINEAR_API_KEY or LINEAR_TEAM_ID env vars." };
    }

    let outcome: { ok: boolean; externalUrl?: string; error?: string };
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

    await ctx.runMutation(internal.exports.record, {
      boardId: board._id,
      resultsId,
      kind: "linear",
      status: outcome.ok ? "sent" : "failed",
      target: `team ${teamId}`,
      externalUrl: outcome.externalUrl,
      error: outcome.error,
    });
    return outcome;
  },
});
