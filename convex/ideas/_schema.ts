import { defineTable } from "convex/server";
import { z, zid, zodToConvexFields } from "../lib/z";

export const ideaFields = {
  boardId: zid("boards"),
  title: z.string(),
  pitch: z.string(),
};

export const ideasTable = defineTable(zodToConvexFields(ideaFields)).index(
  "by_board",
  ["boardId"],
);
