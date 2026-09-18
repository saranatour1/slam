import { defineTable } from "convex/server";
import { z, zid, zodToConvexFields } from "../lib/z";

export const pollOption = z.object({
  id: z.string(),
  label: z.string(),
});

export const pollStatus = z.enum(["open", "closed"]);

export const pollFields = {
  boardId: zid("boards"),
  question: z.string(),
  options: z.array(pollOption),
  endsAt: z.number(),
  status: pollStatus,
  closeJobId: zid("_scheduled_functions").optional(),
  resultsId: zid("pollResults").optional(),
};

export const pollsTable = defineTable(zodToConvexFields(pollFields)).index(
  "by_board",
  ["boardId"],
);
