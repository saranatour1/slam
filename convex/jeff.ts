import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireBoardOwner } from "./lib/auth";
import { pick } from "./lib/validators";
import schema, { jeffJudgmentStatus, jeffVerdict } from "./schema";

const scoreThought = v.object({
  score: v.number(),
  confidence: v.number(),
});

/** Public shape returned to callers once Jeff finishes (or fails). */
export const jeffJudgmentView = v.object({
  ...pick(schema.tables.jeffJudgments.validator.fields, [
    "ideaId",
    "boardId",
    "status",
    "model",
    "verdict",
    "verdictConfidence",
    "verdictProbabilities",
    "worthPursuing",
    "thoughts",
    "usage",
    "error",
    "completedAt",
  ]),
  _id: v.id("jeffJudgments"),
  _creationTime: v.number(),
});

async function assertIdeaOwner(ctx: MutationCtx, ideaId: Id<"ideas">) {
  const idea = await ctx.db.get(ideaId);
  if (idea === null) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Idea not found" });
  }
  const { user, board } = await requireBoardOwner(ctx, idea.boardId);
  return { user, board, idea };
}

/**
 * Authorize on a mutation (session is available here), then judge from an
 * internal action. Client-called actions do not see Convex Auth v2 identity.
 *
 * Jeff asks TypeSafe System One (Jev) in one call:
 * - Choice `verdict`: yes | no | thoughts
 * - Noul `worthPursuing`: P(worth pursuing)
 * - Score thoughts: clarity, novelty, feasibility
 */
export const evaluateIdea = mutation({
  args: { ideaId: v.id("ideas") },
  returns: v.id("jeffJudgments"),
  handler: async (ctx, { ideaId }) => {
    const { user, idea } = await assertIdeaOwner(ctx, ideaId);
    const judgmentId: Id<"jeffJudgments"> = await ctx.runMutation(
      internal.jeff.enqueue,
      {
        ideaId: idea._id,
        boardId: idea.boardId,
        requestedBy: user._id,
      },
    );
    return judgmentId;
  },
});

/** Insert a pending judgment and schedule TypeSafe evaluation. */
export const enqueue = internalMutation({
  args: {
    ideaId: v.id("ideas"),
    boardId: v.id("boards"),
    requestedBy: v.optional(v.id("users")),
  },
  returns: v.id("jeffJudgments"),
  handler: async (ctx, args) => {
    const judgmentId = await ctx.db.insert("jeffJudgments", {
      ideaId: args.ideaId,
      boardId: args.boardId,
      status: "pending",
      requestedBy: args.requestedBy,
    });
    await ctx.scheduler.runAfter(0, internal.jeffEvaluate.run, { judgmentId });
    return judgmentId;
  },
});

export const loadForEvaluate = internalQuery({
  args: { judgmentId: v.id("jeffJudgments") },
  returns: v.union(
    v.null(),
    v.object({
      judgmentId: v.id("jeffJudgments"),
      status: jeffJudgmentStatus,
      idea: v.object({
        _id: v.id("ideas"),
        title: v.string(),
        pitch: v.string(),
      }),
      board: v.object({
        _id: v.id("boards"),
        title: v.string(),
        description: v.optional(v.string()),
      }),
    }),
  ),
  handler: async (ctx, { judgmentId }) => {
    const judgment = await ctx.db.get(judgmentId);
    if (judgment === null) return null;
    const idea = await ctx.db.get(judgment.ideaId);
    if (idea === null) return null;
    const board = await ctx.db.get(judgment.boardId);
    if (board === null) return null;
    return {
      judgmentId,
      status: judgment.status,
      idea: { _id: idea._id, title: idea.title, pitch: idea.pitch },
      board: {
        _id: board._id,
        title: board.title,
        description: board.description,
      },
    };
  },
});

export const markComplete = internalMutation({
  args: {
    judgmentId: v.id("jeffJudgments"),
    model: v.string(),
    verdict: jeffVerdict,
    verdictConfidence: v.number(),
    verdictProbabilities: v.object({
      yes: v.number(),
      no: v.number(),
      thoughts: v.number(),
    }),
    worthPursuing: v.number(),
    thoughts: v.object({
      clarity: scoreThought,
      novelty: scoreThought,
      feasibility: scoreThought,
    }),
    usage: v.object({
      inputTokens: v.number(),
      outputTokens: v.number(),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const judgment = await ctx.db.get(args.judgmentId);
    if (judgment === null || judgment.status !== "pending") return null;
    const { judgmentId, ...rest } = args;
    await ctx.db.patch(judgmentId, {
      ...rest,
      status: "complete",
      completedAt: Date.now(),
    });
    return null;
  },
});

export const markFailed = internalMutation({
  args: {
    judgmentId: v.id("jeffJudgments"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { judgmentId, error }) => {
    const judgment = await ctx.db.get(judgmentId);
    if (judgment === null || judgment.status !== "pending") return null;
    await ctx.db.patch(judgmentId, {
      status: "failed",
      error,
      completedAt: Date.now(),
    });
    return null;
  },
});

/** Newest judgment for an idea (any status), or null. */
export const latestForIdea = query({
  args: { ideaId: v.id("ideas") },
  returns: v.union(jeffJudgmentView, v.null()),
  handler: async (ctx, { ideaId }) => {
    const row = await ctx.db
      .query("jeffJudgments")
      .withIndex("by_idea", (q) => q.eq("ideaId", ideaId))
      .order("desc")
      .first();
    if (row === null) return null;
    const { requestedBy: _, ...view } = row;
    return view;
  },
});

/** Recent Jeff judgments on a board (newest first). */
export const listForBoard = query({
  args: { boardId: v.id("boards"), limit: v.optional(v.number()) },
  returns: v.array(jeffJudgmentView),
  handler: async (ctx, { boardId, limit }) => {
    const take = Math.min(Math.max(limit ?? 50, 1), 200);
    const rows = await ctx.db
      .query("jeffJudgments")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .order("desc")
      .take(take);
    return rows.map(({ requestedBy: _, ...view }) => view);
  },
});
