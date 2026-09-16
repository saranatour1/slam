import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { counter, keys } from "./counters";
import { requireBoardOwner, requireUser, touchParticipant } from "./lib/auth";
import { omit } from "./lib/validators";
import { loadIdeas, loadOptionCounts } from "./lib/views";
import schema from "./schema";

const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

// Derived from schema.ts: the frozen pollResults row plus its export log.
export const resultsView = v.object({
  ...schema.tables.pollResults.validator.fields,
  _id: v.id("pollResults"),
  exports: v.array(
    v.object({
      ...omit(schema.tables.exports.validator.fields, ["boardId", "resultsId"]),
      _id: v.id("exports"),
      _creationTime: v.number(),
    }),
  ),
});

/** Creates a poll that is open immediately and closes itself at `endsAt`. */
export const create = mutation({
  args: {
    boardId: v.id("boards"),
    question: v.string(),
    options: v.array(v.string()),
    durationMinutes: v.number(),
  },
  returns: v.id("polls"),
  handler: async (ctx, { boardId, question, options, durationMinutes }) => {
    await requireBoardOwner(ctx, boardId);
    const q = question.trim();
    if (q.length === 0 || q.length > 200) {
      throw new ConvexError({
        code: "INVALID",
        message: "Question must be 1-200 chars",
      });
    }
    const labels = options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (labels.length < 2 || labels.length > 10) {
      throw new ConvexError({ code: "INVALID", message: "Give 2-10 options" });
    }
    if (
      !Number.isFinite(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes * 60_000 > MAX_DURATION_MS
    ) {
      throw new ConvexError({
        code: "INVALID",
        message: "Duration must be 1 minute to 30 days",
      });
    }
    const existingOpen = (
      await ctx.db
        .query("polls")
        .withIndex("by_board", (idx) => idx.eq("boardId", boardId))
        .take(50)
    ).find((p) => p.status === "open");
    if (existingOpen !== undefined) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "End the current poll first",
      });
    }

    const endsAt = Date.now() + durationMinutes * 60_000;
    const pollId = await ctx.db.insert("polls", {
      boardId,
      question: q,
      options: labels.map((label, i) => ({ id: `opt${i + 1}`, label })),
      endsAt,
      status: "open",
    });
    const closeJobId = await ctx.scheduler.runAt(endsAt, internal.polls.close, {
      pollId,
    });
    await ctx.db.patch(pollId, { closeJobId });
    return pollId;
  },
});

export const endNow = mutation({
  args: { pollId: v.id("polls") },
  returns: v.id("pollResults"),
  handler: async (ctx, { pollId }) => {
    const poll = await ctx.db.get(pollId);
    if (poll === null) throw new ConvexError({ code: "NOT_FOUND", message: "Poll not found" });
    await requireBoardOwner(ctx, poll.boardId);
    if (poll.status === "closed" && poll.resultsId) return poll.resultsId;
    if (poll.closeJobId) await ctx.scheduler.cancel(poll.closeJobId);
    return await closePoll(ctx, pollId);
  },
});

export const castVote = mutation({
  args: { pollId: v.id("polls"), optionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { pollId, optionId }) => {
    const user = await requireUser(ctx);
    const poll = await ctx.db.get(pollId);
    if (poll === null) throw new ConvexError({ code: "NOT_FOUND", message: "Poll not found" });
    if (poll.status !== "open" || poll.endsAt <= Date.now()) {
      throw new ConvexError({ code: "CLOSED", message: "This poll has ended" });
    }
    if (!poll.options.some((o) => o.id === optionId)) {
      throw new ConvexError({ code: "INVALID", message: "Unknown option" });
    }
    const existing = await ctx.db
      .query("pollVotes")
      .withIndex("by_poll_user", (q) => q.eq("pollId", pollId).eq("userId", user._id))
      .unique();
    if (existing === null) {
      await ctx.db.insert("pollVotes", {
        pollId,
        boardId: poll.boardId,
        userId: user._id,
        optionId,
      });
      await counter.inc(ctx, keys.pollOption(pollId, optionId));
      await counter.inc(ctx, keys.pollTotal(pollId));
    } else if (existing.optionId !== optionId) {
      await ctx.db.patch(existing._id, { optionId });
      await counter.dec(ctx, keys.pollOption(pollId, existing.optionId));
      await counter.inc(ctx, keys.pollOption(pollId, optionId));
    }
    const board = await ctx.db.get(poll.boardId);
    if (board && board.creatorId !== user._id) {
      await touchParticipant(ctx, poll.boardId, user._id);
    }
    return null;
  },
});

/** Scheduled at `endsAt`. Idempotent: a poll already closed is left alone. */
export const close = internalMutation({
  args: { pollId: v.id("polls") },
  returns: v.null(),
  handler: async (ctx, { pollId }) => {
    await closePoll(ctx, pollId);
    return null;
  },
});

/** Freeze the tallies into a `pollResults` row and mark the poll closed. */
async function closePoll(ctx: MutationCtx, pollId: Id<"polls">): Promise<Id<"pollResults">> {
  const poll = await ctx.db.get(pollId);
  if (poll === null) throw new ConvexError({ code: "NOT_FOUND", message: "Poll not found" });
  if (poll.status === "closed" && poll.resultsId) return poll.resultsId;

  const [options, tallied, participants] = await Promise.all([
    loadOptionCounts(ctx, poll),
    loadIdeas(ctx, poll.boardId),
    ctx.db
      .query("participants")
      .withIndex("by_board", (q) => q.eq("boardId", poll.boardId))
      .take(1000),
  ]);
  const totals = options.map(({ id, label, count }) => ({
    optionId: id,
    label,
    count,
  }));
  const totalVotes = totals.reduce((sum, t) => sum + t.count, 0);
  const ideas = tallied.map(({ _id, title, up, down, score, comments }) => ({
    ideaId: _id,
    title,
    up,
    down,
    score,
    comments,
  }));

  const resultsId = await ctx.db.insert("pollResults", {
    boardId: poll.boardId,
    pollId,
    question: poll.question,
    closedAt: Date.now(),
    totalVotes,
    totals,
    ideas,
    participants: participants.length,
  });
  await ctx.db.patch(pollId, {
    status: "closed",
    resultsId,
    closeJobId: undefined,
  });
  return resultsId;
}

export const getResults = query({
  args: { resultsId: v.id("pollResults") },
  returns: v.union(resultsView, v.null()),
  handler: async (ctx, { resultsId }) => {
    const results = await ctx.db.get(resultsId);
    if (results === null) return null;
    const exports = await ctx.db
      .query("exports")
      .withIndex("by_results", (q) => q.eq("resultsId", resultsId))
      .order("desc")
      .take(20);
    return {
      _id: results._id,
      boardId: results.boardId,
      pollId: results.pollId,
      question: results.question,
      closedAt: results.closedAt,
      totalVotes: results.totalVotes,
      totals: results.totals,
      ideas: results.ideas,
      participants: results.participants,
      exports: exports.map((e) => ({
        _id: e._id,
        _creationTime: e._creationTime,
        kind: e.kind,
        status: e.status,
        target: e.target,
        externalUrl: e.externalUrl,
        error: e.error,
      })),
    };
  },
});
