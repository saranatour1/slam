import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { counter, keys } from "../counters";
import { pollStatus } from "../polls/_schema";
import { z, zid } from "./z";

type Ctx = QueryCtx | MutationCtx;
export const MAX_IDEAS = 200;

export const ideaView = z.object({
  _id: zid("ideas"),
  _creationTime: z.number(),
  title: z.string(),
  pitch: z.string(),
  up: z.number(),
  down: z.number(),
  score: z.number(),
  comments: z.number(),
});

export const pollView = z.object({
  _id: zid("polls"),
  _creationTime: z.number(),
  question: z.string(),
  endsAt: z.number(),
  status: pollStatus,
  resultsId: zid("pollResults").optional(),
  options: z.array(
    z.object({ id: z.string(), label: z.string(), count: z.number() }),
  ),
  totalVotes: z.number(),
});

export const boardView = z.object({
  _id: zid("boards"),
  _creationTime: z.number(),
  creatorId: zid("users"),
  title: z.string(),
  description: z.string().optional(),
  slug: z.string(),
  commentsEnabled: z.boolean(),
  votesEnabled: z.boolean(),
  creatorName: z.string(),
  ideas: z.array(ideaView),
  activePoll: z.union([pollView, z.null()]),
  closedPolls: z.array(pollView),
});

const count = async (ctx: Ctx, key: string) =>
  Math.round(await counter.count(ctx, key));

/** Ideas on a board with their sharded tallies, best score first. */
export async function loadIdeas(ctx: Ctx, boardId: Id<"boards">) {
  const ideas = await ctx.db
    .query("ideas")
    .withIndex("by_board", (q) => q.eq("boardId", boardId))
    .order("desc")
    .take(MAX_IDEAS);
  const tallied = await Promise.all(
    ideas.map(async ({ _id, _creationTime, title, pitch }) => {
      const [up, down, comments] = await Promise.all([
        count(ctx, keys.up(_id)),
        count(ctx, keys.down(_id)),
        count(ctx, keys.comments(_id)),
      ]);
      return {
        _id,
        _creationTime,
        title,
        pitch,
        up,
        down,
        score: up - down,
        comments,
      };
    }),
  );
  return tallied.sort((a, b) => b.score - a.score);
}

/** Per-option tallies for a poll. */
export function loadOptionCounts(ctx: Ctx, poll: Doc<"polls">) {
  return Promise.all(
    poll.options.map(async (o) => ({
      ...o,
      count: await count(ctx, keys.pollOption(poll._id, o.id)),
    })),
  );
}

export async function loadPollView(ctx: Ctx, poll: Doc<"polls">) {
  const { _id, _creationTime, question, endsAt, status, resultsId } = poll;
  const [options, totalVotes] = await Promise.all([
    loadOptionCounts(ctx, poll),
    count(ctx, keys.pollTotal(_id)),
  ]);
  return {
    _id,
    _creationTime,
    question,
    endsAt,
    status,
    resultsId,
    options,
    totalVotes,
  };
}

export async function loadBoardView(ctx: Ctx, board: Doc<"boards">) {
  const { notifyEmail: _, ...publicFields } = board;
  const [creator, polls, ideas] = await Promise.all([
    ctx.db.get(board.creatorId),
    ctx.db
      .query("polls")
      .withIndex("by_board", (q) => q.eq("boardId", board._id))
      .order("desc")
      .take(20),
    loadIdeas(ctx, board._id),
  ]);
  const active = polls.find((p) => p.status === "open");
  const closed = polls.filter((p) => p.status === "closed");
  return {
    ...publicFields,
    creatorName: creator?.displayName ?? "Creator",
    ideas,
    activePoll: active ? await loadPollView(ctx, active) : null,
    closedPolls: await Promise.all(closed.map((p) => loadPollView(ctx, p))),
  };
}

export function boardBySlug(ctx: Ctx, slug: string) {
  return ctx.db
    .query("boards")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}
