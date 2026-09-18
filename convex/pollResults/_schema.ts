import { defineTable } from "convex/server";
import { z, zid, zodToConvexFields } from "../lib/z";

export const pollResultIdea = z.object({
  ideaId: zid("ideas"),
  title: z.string(),
  up: z.number(),
  down: z.number(),
  score: z.number(),
  comments: z.number(),
});

export const pollResultTotal = z.object({
  optionId: z.string(),
  label: z.string(),
  count: z.number(),
});

export const pollResultFields = {
  boardId: zid("boards"),
  pollId: zid("polls"),
  question: z.string(),
  closedAt: z.number(),
  totalVotes: z.number(),
  totals: z.array(pollResultTotal),
  ideas: z.array(pollResultIdea),
  participants: z.number(),
};

export const pollResultsTable = defineTable(
  zodToConvexFields(pollResultFields),
)
  .index("by_board", ["boardId"])
  .index("by_poll", ["pollId"]);
