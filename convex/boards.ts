import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  currentUser,
  requireBoardOwner,
  requireCreator,
  requireUser,
  touchParticipant,
} from "./lib/auth";
import { slugify } from "./lib/names";
import { pick } from "./lib/validators";
import { boardBySlug, boardView, loadBoardView, MAX_IDEAS } from "./lib/views";
import { z, zid, zMutation, zQuery } from "./lib/z";
import { voteValue } from "./votes/_schema";
import { ownedBoard } from "./boards/_helpers";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const create = zMutation({
  args: {
    title: z.string().trim().min(1).max(120),
    description: z.string().optional(),
  },
  returns: z.object({ boardId: zid("boards"), slug: z.string() }),
  handler: async (ctx, { title, description }) => {
    const user = await requireCreator(ctx);
    const slug = slugify(title);
    const boardId = await ctx.db.insert("boards", {
      creatorId: user._id,
      title,
      description: description?.trim() || undefined,
      slug,
      commentsEnabled: true,
      votesEnabled: true,
    });
    return { boardId, slug };
  },
});

export const updateSettings = zMutation({
  args: {
    boardId: zid("boards"),
    commentsEnabled: z.boolean().optional(),
    votesEnabled: z.boolean().optional(),
    notifyEmail: z.string().optional(),
    description: z.string().optional(),
  },
  returns: z.null(),
  handler: async (
    ctx,
    { boardId, commentsEnabled, votesEnabled, notifyEmail, description },
  ) => {
    await requireBoardOwner(ctx, boardId);
    const email = notifyEmail?.trim();
    if (email && !EMAIL.test(email)) {
      throw new ConvexError({ code: "INVALID", message: "Invalid email" });
    }
    const patch: Partial<Doc<"boards">> = {};
    if (commentsEnabled !== undefined) patch.commentsEnabled = commentsEnabled;
    if (votesEnabled !== undefined) patch.votesEnabled = votesEnabled;
    if (notifyEmail !== undefined) patch.notifyEmail = email || undefined;
    if (description !== undefined) {
      patch.description = description.trim() || undefined;
    }
    await ctx.db.patch(boardId, patch);
    return null;
  },
});

/** Called by the public page after anonymous sign-in; registers the session. */
export const join = zMutation({
  args: { slug: z.string() },
  returns: z.union([zid("boards"), z.null()]),
  handler: async (ctx, { slug }) => {
    const user = await requireUser(ctx);
    const board = await boardBySlug(ctx, slug);
    if (!board) return null;
    if (board.creatorId !== user._id) {
      await touchParticipant(ctx, board._id, user._id);
    }
    return board._id;
  },
});

export const listMine = zQuery({
  args: {},
  returns: z.array(
    z.object({
      _id: zid("boards"),
      _creationTime: z.number(),
      title: z.string(),
      slug: z.string(),
      commentsEnabled: z.boolean(),
      votesEnabled: z.boolean(),
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
      pick(b, [
        "_id",
        "_creationTime",
        "title",
        "slug",
        "commentsEnabled",
        "votesEnabled",
      ]),
    );
  },
});

/** Public board page. Works signed-out; user-specific state is in `myActivity`. */
export const getBySlug = zQuery({
  args: { slug: z.string() },
  returns: z.union([boardView, z.null()]),
  handler: async (ctx, { slug }) => {
    const board = await boardBySlug(ctx, slug);
    return board && (await loadBoardView(ctx, board));
  },
});

/** Creator dashboard: the public view plus private settings. */
export const getMine = zQuery({
  args: { boardId: zid("boards") },
  returns: z.union([
    z.object({
      board: boardView,
      notifyEmail: z.string().optional(),
      participantCount: z.number(),
    }),
    z.null(),
  ]),
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

/** The caller's own votes on this board, so the UI can highlight them. */
export const myActivity = zQuery({
  args: { boardId: zid("boards") },
  returns: z.union([
    z.null(),
    z.object({
      votes: z.array(
        z.object({
          ideaId: zid("ideas"),
          value: voteValue,
        }),
      ),
      pollVotes: z.array(
        z.object({
          pollId: zid("polls"),
          optionId: z.string(),
        }),
      ),
    }),
  ]),
  handler: async (ctx, { boardId }) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    const [votes, pollVotes] = await Promise.all([
      ctx.db
        .query("votes")
        .withIndex("by_board_author", (q) =>
          q.eq("boardId", boardId).eq("userId", user._id),
        )
        .take(MAX_IDEAS),
      ctx.db
        .query("pollVotes")
        .withIndex("by_board_author", (q) =>
          q.eq("boardId", boardId).eq("userId", user._id),
        )
        .take(50),
    ]);
    return {
      votes: votes.map((x) => pick(x, ["ideaId", "value"])),
      pollVotes: pollVotes.map((x) => pick(x, ["pollId", "optionId"])),
    };
  },
});

/** Creator-only: who has been on the board, when, and how active they were. */
export const listParticipants = zQuery({
  args: { boardId: zid("boards") },
  returns: z.array(
    z.object({
      userId: zid("users"),
      joinedAt: z.number(),
      lastSeenAt: z.number(),
      displayName: z.string(),
      votes: z.number(),
      comments: z.number(),
      pollVotes: z.number(),
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
            .withIndex("by_board_author", (q) =>
              q.eq("boardId", boardId).eq("userId", userId),
            )
            .take(MAX_IDEAS),
          ctx.db
            .query("comments")
            .withIndex("by_board_author", (q) =>
              q.eq("boardId", boardId).eq("authorId", userId),
            )
            .take(500),
          ctx.db
            .query("pollVotes")
            .withIndex("by_board_author", (q) =>
              q.eq("boardId", boardId).eq("userId", userId),
            )
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
