import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { counter, keys } from "../counters";
import schema, { pollOption } from "../schema";
import { omit } from "./validators";

type Ctx = QueryCtx | MutationCtx;
export const MAX_IDEAS = 200;

// Validators are derived from schema.ts: stored fields, minus what the handler
// doesn't return, plus the system fields (`_id`, `_creationTime`) and what it
// computes. `returns` validation rejects extra keys, so every builder below must
// return exactly these keys: spreading a raw document is only safe when both
// system fields are declared here.
export const ideaView = v.object({
  ...omit(schema.tables.ideas.validator.fields, ["boardId"]),
  _id: v.id("ideas"),
  _creationTime: v.number(),
  up: v.number(),
  down: v.number(),
  score: v.number(),
  comments: v.number(),
});

export const pollView = v.object({
  ...omit(schema.tables.polls.validator.fields, ["boardId", "closeJobId", "options"]),
  _id: v.id("polls"),
  _creationTime: v.number(),
  options: v.array(v.object({ ...pollOption.fields, count: v.number() })),
  totalVotes: v.number(),
});

export const boardView = v.object({
  ...omit(schema.tables.boards.validator.fields, ["notifyEmail"]),
  _id: v.id("boards"),
  _creationTime: v.number(),
  creatorName: v.string(),
  ideas: v.array(ideaView),
  activePoll: v.union(pollView, v.null()),
  closedPolls: v.array(pollView),
});

const count = async (ctx: Ctx, key: string) => Math.round(await counter.count(ctx, key));

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
  return { _id, _creationTime, question, endsAt, status, resultsId, options, totalVotes };
}

export async function loadBoardView(ctx: Ctx, board: Doc<"boards">) {
  // Everything left after dropping `notifyEmail` (stored fields plus `_id` and
  // `_creationTime`) is declared on `boardView`.
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
