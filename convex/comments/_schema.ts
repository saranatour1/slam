import { defineTable } from "convex/server";
import { z, zid, zodToConvexFields } from "../lib/z";

export const commentFields = {
  boardId: zid("boards"),
  ideaId: zid("ideas"),
  authorId: zid("users"),
  body: z.string(),
};

export const commentsTable = defineTable(zodToConvexFields(commentFields))
  .index("by_idea", ["ideaId"])
  .index("by_board_author", ["boardId", "authorId"]);
