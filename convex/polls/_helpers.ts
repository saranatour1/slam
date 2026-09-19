import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { loadIdeas, loadOptionCounts } from "../lib/views";

/** Freeze the tallies into a `pollResults` row and mark the poll closed. */
export async function closePoll(
  ctx: MutationCtx,
  pollId: Id<"polls">,
): Promise<Id<"pollResults">> {
  const poll = await ctx.db.get(pollId);
  if (poll === null) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Poll not found" });
  }
  if (poll.status === "closed" && poll.resultsId) return poll.resultsId;

  const [options, tallied, participants] = await Promise.all([
    loadOptionCounts(ctx, poll),
    loadIdeas(ctx, poll.boardId),
    ctx.db
      .query("participants")
      .withIndex("by_board", (q) => q.eq("boardId", poll.boardId))
      .take(1000),
  ]);
  const totals = options.map(({ id, label, count }) => ({
    optionId: id,
    label,
    count,
  }));
  const totalVotes = totals.reduce((sum, t) => sum + t.count, 0);
  const ideas = tallied.map(({ _id, title, up, down, score, comments }) => ({
    ideaId: _id,
    title,
    up,
    down,
    score,
    comments,
  }));

  const resultsId = await ctx.db.insert("pollResults", {
    boardId: poll.boardId,
    pollId,
    question: poll.question,
    closedAt: Date.now(),
    totalVotes,
    totals,
    ideas,
    participants: participants.length,
  });
  await ctx.db.patch(pollId, {
    status: "closed",
    resultsId,
    closeJobId: undefined,
  });
  return resultsId;
}
