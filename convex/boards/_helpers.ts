import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { currentUser } from "../lib/auth";

/** The board if the caller is its creator, otherwise null (no throw: used by queries). */
export async function ownedBoard(
  ctx: QueryCtx,
  boardId: Id<"boards">,
): Promise<Doc<"boards"> | null> {
  const user = await currentUser(ctx);
  const board = user && (await ctx.db.get(boardId));
  return board && board.creatorId === user._id ? board : null;
}
