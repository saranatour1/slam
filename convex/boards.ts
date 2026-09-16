import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import {
  currentUser,
  requireBoardOwner,
  requireCreator,
  requireUser,
  touchParticipant,
} from "./lib/auth";
import { slugify } from "./lib/names";
import { omit, pick } from "./lib/validators";
import { boardBySlug, boardView, loadBoardView, MAX_IDEAS } from "./lib/views";
import schema from "./schema";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The board if the caller is its creator, otherwise null (no throw: used by queries). */
async function ownedBoard(ctx: QueryCtx, boardId: Id<"boards">): Promise<Doc<"boards"> | null> {
  const user = await currentUser(ctx);
  const board = user && (await ctx.db.get(boardId));
  return board && board.creatorId === user._id ? board : null;
}

export const create = mutation({
  args: { title: v.string(), description: v.optional(v.string()) },
  returns: v.object({ boardId: v.id("boards"), slug: v.string() }),
  handler: async (ctx, { title, description }) => {
    const user = await requireCreator(ctx);
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > 120)
      throw new ConvexError({
        code: "INVALID",
        message: "Title must be 1-120 chars",
      });
    const slug = slugify(trimmed);
    const boardId = await ctx.db.insert("boards", {
      creatorId: user._id,
      title: trimmed,
      description: description?.trim() || undefined,
      slug,
      commentsEnabled: true,
      votesEnabled: true,
    });
    return { boardId, slug };
  },
});

export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      ...pick(schema.tables.boards.validator.fields, [
        "title",
        "slug",
        "commentsEnabled",
        "votesEnabled",
      ]),
      _id: v.id("boards"),
      _creationTime: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (user?.role !== "creator") return [];
    const boards = await ctx.db
      .query("boards")
      .withIndex("by_creator", (q) => q.eq("creatorId", user._id))
      .order("desc")
      .take(100);
    return boards.map((b) =>
      pick(b, ["_id", "_creationTime", "title", "slug", "commentsEnabled", "votesEnabled"]),
    );
  },
});

/** Public board page. Works signed-out; user-specific state is in `myActivity`. */
export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(boardView, v.null()),
  handler: async (ctx, { slug }) => {
    const board = await boardBySlug(ctx, slug);
    return board && (await loadBoardView(ctx, board));
  },
});

/** Creator dashboard: the public view plus private settings. */
export const getMine = query({
  args: { boardId: v.id("boards") },
  returns: v.union(
    v.object({
      board: boardView,
      notifyEmail: v.optional(v.string()),
      participantCount: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, { boardId }) => {
    const board = await ownedBoard(ctx, boardId);
    if (!board) return null;
    const participants = await ctx.db
      .query("participants")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .take(1000);
    return {
      board: await loadBoardView(ctx, board),
      notifyEmail: board.notifyEmail,
      participantCount: participants.length,
    };
  },
});

export const updateSettings = mutation({
  args: {
    boardId: v.id("boards"),
    commentsEnabled: v.optional(v.boolean()),
    votesEnabled: v.optional(v.boolean()),
    notifyEmail: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { boardId, commentsEnabled, votesEnabled, notifyEmail, description }) => {
    await requireBoardOwner(ctx, boardId);
    const email = notifyEmail?.trim();
    if (email && !EMAIL.test(email))
      throw new ConvexError({ code: "INVALID", message: "Invalid email" });
    const patch: Partial<Doc<"boards">> = {};
    if (commentsEnabled !== undefined) patch.commentsEnabled = commentsEnabled;
    if (votesEnabled !== undefined) patch.votesEnabled = votesEnabled;
    if (notifyEmail !== undefined) patch.notifyEmail = email || undefined;
    if (description !== undefined) patch.description = description.trim() || undefined;
    await ctx.db.patch(boardId, patch);
    return null;
  },
});

/** Called by the public page after anonymous sign-in; registers the session. */
export const join = mutation({
  args: { slug: v.string() },
  returns: v.union(v.id("boards"), v.null()),
  handler: async (ctx, { slug }) => {
    const user = await requireUser(ctx);
    const board = await boardBySlug(ctx, slug);
    if (!board) return null;
    if (board.creatorId !== user._id) await touchParticipant(ctx, board._id, user._id);
    return board._id;
  },
});

/** The caller's own votes on this board, so the UI can highlight them. */
export const myActivity = query({
  args: { boardId: v.id("boards") },
  returns: v.union(
    v.null(),
    v.object({
      votes: v.array(v.object(pick(schema.tables.votes.validator.fields, ["ideaId", "value"]))),
      pollVotes: v.array(
        v.object(pick(schema.tables.pollVotes.validator.fields, ["pollId", "optionId"])),
      ),
    }),
  ),
  handler: async (ctx, { boardId }) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    const [votes, pollVotes] = await Promise.all([
      ctx.db
        .query("votes")
        .withIndex("by_board_author", (q) => q.eq("boardId", boardId).eq("userId", user._id))
        .take(MAX_IDEAS),
      ctx.db
        .query("pollVotes")
        .withIndex("by_board_author", (q) => q.eq("boardId", boardId).eq("userId", user._id))
        .take(50),
    ]);
    return {
      votes: votes.map((x) => pick(x, ["ideaId", "value"])),
      pollVotes: pollVotes.map((x) => pick(x, ["pollId", "optionId"])),
    };
  },
});

/** Creator-only: who has been on the board, when, and how active they were. */
export const listParticipants = query({
  args: { boardId: v.id("boards") },
  returns: v.array(
    v.object({
      ...omit(schema.tables.participants.validator.fields, ["boardId"]),
      displayName: v.string(),
      votes: v.number(),
      comments: v.number(),
      pollVotes: v.number(),
    }),
  ),
  handler: async (ctx, { boardId }) => {
    if (!(await ownedBoard(ctx, boardId))) return [];
    const participants = await ctx.db
      .query("participants")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .order("desc")
      .take(200);
    return Promise.all(
      participants.map(async ({ userId, joinedAt, lastSeenAt }) => {
        const [user, votes, comments, pollVotes] = await Promise.all([
          ctx.db.get(userId),
          ctx.db
            .query("votes")
            .withIndex("by_board_author", (q) => q.eq("boardId", boardId).eq("userId", userId))
            .take(MAX_IDEAS),
          ctx.db
            .query("comments")
            .withIndex("by_board_author", (q) => q.eq("boardId", boardId).eq("authorId", userId))
            .take(500),
          ctx.db
            .query("pollVotes")
            .withIndex("by_board_author", (q) => q.eq("boardId", boardId).eq("userId", userId))
            .take(50),
        ]);
        return {
          userId,
          joinedAt,
          lastSeenAt,
          displayName: user?.displayName ?? "Unknown",
          votes: votes.length,
          comments: comments.length,
          pollVotes: pollVotes.length,
        };
      }),
    );
  },
});
