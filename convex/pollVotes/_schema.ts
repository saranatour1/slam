import { defineTable } from "convex/server";
import { z, zid, zodToConvexFields } from "../lib/z";

export const pollVoteFields = {
  pollId: zid("polls"),
  boardId: zid("boards"),
  userId: zid("users"),
  optionId: z.string(),
};

export const pollVotesTable = defineTable(zodToConvexFields(pollVoteFields))
  .index("by_poll_user", ["pollId", "userId"])
  .index("by_board_author", ["boardId", "userId"]);
