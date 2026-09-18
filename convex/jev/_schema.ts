import { defineTable } from "convex/server";
import { z, zid, zodToConvexFields } from "../lib/z";

/** Jev's primary call on an idea (TypeSafe Choice). */
export const jevVerdict = z.enum(["yes", "no", "thoughts"]);

export const jevJudgmentStatus = z.enum(["pending", "complete", "failed"]);

export const jevScoreThought = z.object({
  score: z.number(),
  confidence: z.number(),
});

export const jevJudgmentFields = {
  ideaId: zid("ideas"),
  boardId: zid("boards"),
  status: jevJudgmentStatus,
  requestedBy: zid("users").optional(),
  model: z.string().optional(),
  verdict: jevVerdict.optional(),
  verdictConfidence: z.number().optional(),
  verdictProbabilities: z
    .object({
      yes: z.number(),
      no: z.number(),
      thoughts: z.number(),
    })
    .optional(),
  /** Noul: P(idea is worth pursuing), 0–1. */
  worthPursuing: z.number().optional(),
  thoughts: z
    .object({
      clarity: jevScoreThought,
      novelty: jevScoreThought,
      feasibility: jevScoreThought,
    })
    .optional(),
  usage: z
    .object({
      inputTokens: z.number(),
      outputTokens: z.number(),
    })
    .optional(),
  error: z.string().optional(),
  completedAt: z.number().optional(),
};

export const jevJudgmentsTable = defineTable(zodToConvexFields(jevJudgmentFields))
  .index("by_idea", ["ideaId"])
  .index("by_board", ["boardId"])
  .index("by_idea_and_status", ["ideaId", "status"]);

export const jevJudgmentView = z.object({
  _id: zid("jevJudgments"),
  _creationTime: z.number(),
  ideaId: zid("ideas"),
  boardId: zid("boards"),
  status: jevJudgmentStatus,
  model: z.string().optional(),
  verdict: jevVerdict.optional(),
  verdictConfidence: z.number().optional(),
  verdictProbabilities: z
    .object({
      yes: z.number(),
      no: z.number(),
      thoughts: z.number(),
    })
    .optional(),
  worthPursuing: z.number().optional(),
  thoughts: z
    .object({
      clarity: jevScoreThought,
      novelty: jevScoreThought,
      feasibility: jevScoreThought,
    })
    .optional(),
  usage: z
    .object({
      inputTokens: z.number(),
      outputTokens: z.number(),
    })
    .optional(),
  error: z.string().optional(),
  completedAt: z.number().optional(),
});
