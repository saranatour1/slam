import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { counter, keys } from "./counters";
import { requireBoardOwner, requireUser, touchParticipant } from "./lib/auth";
import { z, zid, zMutation, zQuery } from "./lib/z";
import { exportFields } from "./exports/_schema";
import { pollResultFields } from "./pollResults/_schema";
import { closePoll } from "./polls/_helpers";

const MAX_DURATION_MINUTES = 30 * 24 * 60;

const resultsView = z.object({
  _id: zid("pollResults"),
  ...pollResultFields,
  exports: z.array(
    z.object({
      _id: zid("exports"),
      _creationTime: z.number(),
      kind: exportFields.kind,
      status: exportFields.status,
      target: exportFields.target,
      externalUrl: exportFields.externalUrl,
      error: exportFields.error,
    }),
  ),
});

/** Creates a poll that is open immediately and closes itself at `endsAt`. */
export const create = zMutation({
  args: {
    boardId: zid("boards"),
    question: z.string().trim().min(1).max(200),
    options: z.array(z.string()).min(2).max(10),
    durationMinutes: z.number().finite().min(1).max(MAX_DURATION_MINUTES),
  },
  returns: zid("polls"),
  handler: async (ctx, { boardId, question, options, durationMinutes }) => {
    await requireBoardOwner(ctx, boardId);
    const labels = options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (labels.length < 2 || labels.length > 10) {
      throw new ConvexError({ code: "INVALID", message: "Give 2-10 options" });
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
      question,
      options: labels.map((label, i) => ({ id: `opt${i + 1}`, label })),
      endsAt,
      status: "open",
    });
    const closeJobId = await ctx.scheduler.runAt(
      endsAt,
      internal.polls.internal.close,
      { pollId },
    );
    await ctx.db.patch(pollId, { closeJobId });
    return pollId;
  },
});

export const endNow = zMutation({
  args: { pollId: zid("polls") },
  returns: zid("pollResults"),
  handler: async (ctx, { pollId }) => {
    const poll = await ctx.db.get(pollId);
    if (poll === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Poll not found" });
    }
    await requireBoardOwner(ctx, poll.boardId);
    if (poll.status === "closed" && poll.resultsId) return poll.resultsId;
    if (poll.closeJobId) await ctx.scheduler.cancel(poll.closeJobId);
    return await closePoll(ctx, pollId);
  },
});

export const castVote = zMutation({
  args: { pollId: zid("polls"), optionId: z.string() },
  returns: z.null(),
  handler: async (ctx, { pollId, optionId }) => {
    const user = await requireUser(ctx);
    const poll = await ctx.db.get(pollId);
    if (poll === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Poll not found" });
    }
    if (poll.status !== "open" || poll.endsAt <= Date.now()) {
      throw new ConvexError({ code: "CLOSED", message: "This poll has ended" });
    }
    if (!poll.options.some((o) => o.id === optionId)) {
      throw new ConvexError({ code: "INVALID", message: "Unknown option" });
    }
    const existing = await ctx.db
      .query("pollVotes")
      .withIndex("by_poll_user", (q) =>
        q.eq("pollId", pollId).eq("userId", user._id),
      )
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

export const getResults = zQuery({
  args: { resultsId: zid("pollResults") },
  returns: z.union([resultsView, z.null()]),
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
