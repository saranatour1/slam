import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { env } from "../_generated/server";
import {
  z,
  zid,
  zInternalAction,
  zInternalMutation,
  zInternalQuery,
} from "../lib/z";
import { jevJudgmentStatus, jevScoreThought, jevVerdict } from "./_schema";

const FETCH_TIMEOUT_MS = 30_000;

const VERDICT_OPTIONS = {
  yes: "Promote or pursue this idea as stated.",
  no: "Reject or deprioritize this idea as stated.",
  thoughts: "Interesting but needs refinement before a clear yes or no.",
} as const;

type Verdict = keyof typeof VERDICT_OPTIONS;

function isVerdict(value: string): value is Verdict {
  return value === "yes" || value === "no" || value === "thoughts";
}

/** Insert a pending judgment and schedule TypeSafe evaluation. */
export const enqueue = zInternalMutation({
  args: {
    ideaId: zid("ideas"),
    boardId: zid("boards"),
    requestedBy: zid("users").optional(),
  },
  returns: zid("jevJudgments"),
  handler: async (ctx, args) => {
    const judgmentId = await ctx.db.insert("jevJudgments", {
      ideaId: args.ideaId,
      boardId: args.boardId,
      status: "pending",
      requestedBy: args.requestedBy,
    });
    await ctx.scheduler.runAfter(0, internal.jev.internal.run, { judgmentId });
    return judgmentId;
  },
});

export const loadForEvaluate = zInternalQuery({
  args: { judgmentId: zid("jevJudgments") },
  returns: z.union([
    z.null(),
    z.object({
      judgmentId: zid("jevJudgments"),
      status: jevJudgmentStatus,
      idea: z.object({
        _id: zid("ideas"),
        title: z.string(),
        pitch: z.string(),
      }),
      board: z.object({
        _id: zid("boards"),
        title: z.string(),
        description: z.string().optional(),
      }),
    }),
  ]),
  handler: async (ctx, { judgmentId }) => {
    const judgment = await ctx.db.get(judgmentId);
    if (judgment === null) return null;
    const idea = await ctx.db.get(judgment.ideaId);
    if (idea === null) return null;
    const board = await ctx.db.get(judgment.boardId);
    if (board === null) return null;
    return {
      judgmentId,
      status: judgment.status,
      idea: { _id: idea._id, title: idea.title, pitch: idea.pitch },
      board: {
        _id: board._id,
        title: board.title,
        description: board.description,
      },
    };
  },
});

export const markComplete = zInternalMutation({
  args: {
    judgmentId: zid("jevJudgments"),
    model: z.string(),
    verdict: jevVerdict,
    verdictConfidence: z.number(),
    verdictProbabilities: z.object({
      yes: z.number(),
      no: z.number(),
      thoughts: z.number(),
    }),
    worthPursuing: z.number(),
    thoughts: z.object({
      clarity: jevScoreThought,
      novelty: jevScoreThought,
      feasibility: jevScoreThought,
    }),
    usage: z.object({
      inputTokens: z.number(),
      outputTokens: z.number(),
    }),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const judgment = await ctx.db.get(args.judgmentId);
    if (judgment === null || judgment.status !== "pending") return null;
    const { judgmentId, ...rest } = args;
    await ctx.db.patch(judgmentId, {
      ...rest,
      status: "complete",
      completedAt: Date.now(),
    });
    return null;
  },
});

export const markFailed = zInternalMutation({
  args: {
    judgmentId: zid("jevJudgments"),
    error: z.string(),
  },
  returns: z.null(),
  handler: async (ctx, { judgmentId, error }) => {
    const judgment = await ctx.db.get(judgmentId);
    if (judgment === null || judgment.status !== "pending") return null;
    await ctx.db.patch(judgmentId, {
      status: "failed",
      error,
      completedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Calls TypeSafe System One (Jev) for a pending judgment.
 * Secrets stay here; authorize via `jev.evaluateIdea` / `ideas.add` first.
 */
export const run = zInternalAction({
  args: { judgmentId: zid("jevJudgments") },
  returns: z.null(),
  handler: async (ctx, { judgmentId }) => {
    const loaded = await ctx.runQuery(internal.jev.internal.loadForEvaluate, {
      judgmentId,
    });
    if (loaded === null) return null;
    if (loaded.status !== "pending") return null;

    const apiKey = env.TYPESAFE_API_KEY?.trim();
    if (!apiKey) {
      await ctx.runMutation(internal.jev.internal.markFailed, {
        judgmentId,
        error:
          "Missing TYPESAFE_API_KEY env var. Set it with: npx convex env set TYPESAFE_API_KEY <key>",
      });
      return null;
    }

    const { idea, board } = loaded;
    const state = {
      board: {
        title: board.title,
        description: board.description ?? null,
      },
      idea: {
        title: idea.title,
        pitch: idea.pitch,
      },
      jev: {
        role: "Jev is Slam's idea coach. Judge whether the idea is worth slamming further.",
      },
    };

    try {
      const client = new TypeSafeClient({
        apiKey,
        timeout: FETCH_TIMEOUT_MS,
      });
      const response = await client.systemOne({
        state,
        questions: {
          verdict: choice(
            "Given `board` and `idea`, should Jev say yes (pursue), no (reject), or thoughts (needs refinement)?",
            VERDICT_OPTIONS,
          ),
          worthPursuing: noul(
            "Is `idea` worth pursuing on this Slam board, given `board`?",
            {
              true: "Worth promoting, iterating, or polling on.",
              false: "Not a good fit or too weak as stated.",
            },
          ),
          clarity: score(
            "How clear is `idea.pitch` about what is being proposed?",
            [
              "Vague or confusing; hard to act on.",
              "Somewhat clear but missing important detail.",
              "Clear and specific enough to discuss or vote on.",
            ],
          ),
          novelty: score(
            "How novel or distinctive is `idea` relative to a typical brainstorm?",
            [
              "Common or generic.",
              "Somewhat fresh angle.",
              "Distinctive and interesting.",
            ],
          ),
          feasibility: score(
            "How feasible does `idea` seem as a next step for this board?",
            [
              "Unrealistic or undefined.",
              "Plausible with effort or unknowns.",
              "Concrete and actionable soon.",
            ],
          ),
        },
      });

      const { answers, model, usage } = response;
      const chosen = answers.verdict.choice;
      if (!isVerdict(chosen)) {
        throw new ConvexError({
          code: "INVALID",
          message: `Unexpected Jev verdict from TypeSafe: ${String(chosen)}`,
        });
      }

      await ctx.runMutation(internal.jev.internal.markComplete, {
        judgmentId,
        model,
        verdict: chosen,
        verdictConfidence: answers.verdict.confidence,
        verdictProbabilities: {
          yes: answers.verdict.probabilities.yes,
          no: answers.verdict.probabilities.no,
          thoughts: answers.verdict.probabilities.thoughts,
        },
        worthPursuing: answers.worthPursuing.noul,
        thoughts: {
          clarity: {
            score: answers.clarity.score,
            confidence: answers.clarity.confidence,
          },
          novelty: {
            score: answers.novelty.score,
            confidence: answers.novelty.confidence,
          },
          feasibility: {
            score: answers.feasibility.score,
            confidence: answers.feasibility.confidence,
          },
        },
        usage: {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
        },
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.jev.internal.markFailed, {
        judgmentId,
        error,
      });
    }
    return null;
  },
});
