import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireBoardOwner } from "./lib/auth";
import { z, zid, zMutation } from "./lib/z";

async function assertOwner(ctx: MutationCtx, resultsId: Id<"pollResults">) {
  const results = await ctx.db.get(resultsId);
  if (results === null) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Results not found" });
  }
  const { user, board } = await requireBoardOwner(ctx, results.boardId);
  return { user, results, board };
}

/**
 * Authorize on a mutation (session is available here), then send from an
 * internal action. Client-called actions do not see Convex Auth v2 identity.
 */
export const emailResults = zMutation({
  args: {
    resultsId: zid("pollResults"),
    to: z.string().optional(),
  },
  returns: z.null(),
  handler: async (ctx, { resultsId, to }) => {
    const { user, board } = await assertOwner(ctx, resultsId);
    const recipient = to?.trim() || board.notifyEmail;
    if (!recipient) {
      throw new ConvexError({
        code: "INVALID",
        message: "Set a notify email on the board first.",
      });
    }
    await ctx.scheduler.runAfter(0, internal.exports.internal.sendEmail, {
      resultsId,
      userId: user._id,
      to: recipient,
    });
    return null;
  },
});

export const linearResults = zMutation({
  args: { resultsId: zid("pollResults") },
  returns: z.null(),
  handler: async (ctx, { resultsId }) => {
    const { user } = await assertOwner(ctx, resultsId);
    await ctx.scheduler.runAfter(0, internal.exports.internal.sendLinear, {
      resultsId,
      userId: user._id,
    });
    return null;
  },
});
