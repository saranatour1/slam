import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireBoardOwner } from "./lib/auth";
import { z, zid, zMutation, zQuery } from "./lib/z";
import { jevJudgmentView } from "./jev/_schema";

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
 * Jev asks TypeSafe System One in one call:
 * - Choice `verdict`: yes | no | thoughts
 * - Noul `worthPursuing`: P(worth pursuing)
 * - Score thoughts: clarity, novelty, feasibility
 */
export const evaluateIdea = zMutation({
  args: { ideaId: zid("ideas") },
  returns: zid("jevJudgments"),
  handler: async (ctx, { ideaId }) => {
    const { user, idea } = await assertIdeaOwner(ctx, ideaId);
    const judgmentId: Id<"jevJudgments"> = await ctx.runMutation(
      internal.jev.internal.enqueue,
      {
        ideaId: idea._id,
        boardId: idea.boardId,
        requestedBy: user._id,
      },
    );
    return judgmentId;
  },
});

/** Newest judgment for an idea (any status), or null. */
export const latestForIdea = zQuery({
  args: { ideaId: zid("ideas") },
  returns: z.union([jevJudgmentView, z.null()]),
  handler: async (ctx, { ideaId }) => {
    const row = await ctx.db
      .query("jevJudgments")
      .withIndex("by_idea", (q) => q.eq("ideaId", ideaId))
      .order("desc")
      .first();
    if (row === null) return null;
    const { requestedBy: _, ...view } = row;
    return view;
  },
});

/** Recent Jev judgments on a board (newest first). */
export const listForBoard = zQuery({
  args: {
    boardId: zid("boards"),
    limit: z.number().optional(),
  },
  returns: z.array(jevJudgmentView),
  handler: async (ctx, { boardId, limit }) => {
    const take = Math.min(Math.max(limit ?? 50, 1), 200);
    const rows = await ctx.db
      .query("jevJudgments")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .order("desc")
      .take(take);
    return rows.map(({ requestedBy: _, ...view }) => view);
  },
});
