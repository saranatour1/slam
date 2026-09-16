import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/core";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

export async function currentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db.get(userId);
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await currentUser(ctx);
  if (user === null) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in first" });
  }
  return user;
}

export async function requireCreator(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "creator") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Only board creators can do this",
    });
  }
  return user;
}

/** Loads the board and asserts the caller owns it. */
export async function requireBoardOwner(
  ctx: Ctx,
  boardId: Id<"boards">,
): Promise<{ user: Doc<"users">; board: Doc<"boards"> }> {
  const user = await requireCreator(ctx);
  const board = await ctx.db.get(boardId);
  if (board === null) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Board not found" });
  }
  if (board.creatorId !== user._id) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Not your board" });
  }
  return { user, board };
}

/**
 * Any signed-in user (anonymous or creator) acting on a board as a participant.
 * Upserts the participant row so the creator can see who is active.
 */
export async function touchParticipant(
  ctx: MutationCtx,
  boardId: Id<"boards">,
  userId: Id<"users">,
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("participants")
    .withIndex("by_board_user", (q) =>
      q.eq("boardId", boardId).eq("userId", userId),
    )
    .unique();
  if (existing === null) {
    await ctx.db.insert("participants", {
      boardId,
      userId,
      joinedAt: now,
      lastSeenAt: now,
    });
  } else {
    await ctx.db.patch(existing._id, { lastSeenAt: now });
  }
}
