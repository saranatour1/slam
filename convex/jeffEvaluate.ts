"use node";

import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";

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

/**
 * Calls TypeSafe System One (Jev) for a pending Jeff judgment.
 * Secrets stay here; authorize via `jeff.evaluateIdea` / `ideas.add` first.
 */
export const run = internalAction({
  args: { judgmentId: v.id("jeffJudgments") },
  returns: v.null(),
  handler: async (ctx, { judgmentId }) => {
    const loaded = await ctx.runQuery(internal.jeff.loadForEvaluate, {
      judgmentId,
    });
    if (loaded === null) return null;
    if (loaded.status !== "pending") return null;

    const apiKey = env.TYPESAFE_API_KEY?.trim();
    if (!apiKey) {
      await ctx.runMutation(internal.jeff.markFailed, {
        judgmentId,
        error: "Missing TYPESAFE_API_KEY env var. Set it with: npx convex env set TYPESAFE_API_KEY <key>",
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
      jeff: {
        role: "Jeff is Slam's idea coach. Judge whether the idea is worth slamming further.",
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
            "Given `board` and `idea`, should Jeff say yes (pursue), no (reject), or thoughts (needs refinement)?",
            VERDICT_OPTIONS,
          ),
          worthPursuing: noul(
            "Is `idea` worth pursuing on this Slam board, given `board`?",
            {
              true: "Worth promoting, iterating, or polling on.",
              false: "Not a good fit or too weak as stated.",
            },
          ),
          clarity: score("How clear is `idea.pitch` about what is being proposed?", [
            "Vague or confusing; hard to act on.",
            "Somewhat clear but missing important detail.",
            "Clear and specific enough to discuss or vote on.",
          ]),
          novelty: score("How novel or distinctive is `idea` relative to a typical brainstorm?", [
            "Common or generic.",
            "Somewhat fresh angle.",
            "Distinctive and interesting.",
          ]),
          feasibility: score("How feasible does `idea` seem as a next step for this board?", [
            "Unrealistic or undefined.",
            "Plausible with effort or unknowns.",
            "Concrete and actionable soon.",
          ]),
        },
      });

      const { answers, model, usage } = response;
      const chosen = answers.verdict.choice;
      if (!isVerdict(chosen)) {
        throw new ConvexError({
          code: "INVALID",
          message: `Unexpected Jeff verdict from TypeSafe: ${String(chosen)}`,
        });
      }

      await ctx.runMutation(internal.jeff.markComplete, {
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
      await ctx.runMutation(internal.jeff.markFailed, { judgmentId, error });
    }
    return null;
  },
});
