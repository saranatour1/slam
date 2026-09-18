import { defineTable } from "convex/server";
import { z, zid, zodToConvexFields } from "../lib/z";

export const boardFields = {
  creatorId: zid("users"),
  title: z.string(),
  description: z.string().optional(),
  slug: z.string(),
  commentsEnabled: z.boolean(),
  votesEnabled: z.boolean(),
  notifyEmail: z.string().optional(),
};

export const boardsTable = defineTable(zodToConvexFields(boardFields))
  .index("by_slug", ["slug"])
  .index("by_creator", ["creatorId"]);
