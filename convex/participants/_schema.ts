import { defineTable } from "convex/server";
import { z, zid, zodToConvexFields } from "../lib/z";

export const participantFields = {
  boardId: zid("boards"),
  userId: zid("users"),
  joinedAt: z.number(),
  lastSeenAt: z.number(),
};

export const participantsTable = defineTable(
  zodToConvexFields(participantFields),
)
  .index("by_board", ["boardId"])
  .index("by_board_user", ["boardId", "userId"]);
