import { defineTable } from "convex/server";
import { z, zid, zodToConvexFields } from "../lib/z";

export const voteValue = z.union([z.literal(1), z.literal(-1)]);

export const voteFields = {
  boardId: zid("boards"),
  ideaId: zid("ideas"),
  userId: zid("users"),
  value: voteValue,
};

export const votesTable = defineTable(zodToConvexFields(voteFields))
  .index("by_idea_user", ["ideaId", "userId"])
  .index("by_board_author", ["boardId", "userId"]);
