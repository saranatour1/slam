import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { counter, keys } from "./counters";
import { requireBoardOwner, requireUser, touchParticipant } from "./lib/auth";
import { z, zid, zMutation, zQuery } from "./lib/z";
import { voteValue } from "./votes/_schema";

export const add = zMutation({
  args: {
    boardId: zid("boards"),
    title: z.string().trim().min(1).max(120),
    pitch: z.string().trim().max(2000),
  },
  returns: zid("ideas"),
  handler: async (ctx, { boardId, title, pitch }) => {
    const { user } = await requireBoardOwner(ctx, boardId);
    const ideaId = await ctx.db.insert("ideas", { boardId, title, pitch });
    // Jev (TypeSafe System One) judges new ideas asynchronously when TYPESAFE_API_KEY is set.
    await ctx.runMutation(internal.jev.internal.enqueue, {
      ideaId,
      boardId,
      requestedBy: user._id,
    });
    return ideaId;
  },
});

export const remove = zMutation({
  args: { ideaId: zid("ideas") },
  returns: z.null(),
  handler: async (ctx, { ideaId }) => {
    const idea = await ctx.db.get(ideaId);
    if (idea === null) return null;
    await requireBoardOwner(ctx, idea.boardId);
    const judgments = await ctx.db
      .query("jevJudgments")
      .withIndex("by_idea", (q) => q.eq("ideaId", ideaId))
      .take(50);
    for (const j of judgments) {
      await ctx.db.delete(j._id);
    }
    await ctx.db.delete(ideaId);
    return null;
  },
});

/**
 * Toggle-style voting: same value again removes the vote, the other value
 * flips it. Tallies live in the sharded counter so bursts don't contend.
 */
export const castVote = zMutation({
  args: { ideaId: zid("ideas"), value: voteValue },
  returns: z.null(),
  handler: async (ctx, { ideaId, value }) => {
    const user = await requireUser(ctx);
    const idea = await ctx.db.get(ideaId);
    if (idea === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Idea not found" });
    }
    const board = await ctx.db.get(idea.boardId);
    if (board === null || !board.votesEnabled) {
      throw new ConvexError({
        code: "DISABLED",
        message: "Voting is off for this board",
      });
    }

    const existing = await ctx.db
      .query("votes")
      .withIndex("by_idea_user", (q) =>
        q.eq("ideaId", ideaId).eq("userId", user._id),
      )
      .unique();

    const keyFor = (v: 1 | -1) => (v === 1 ? keys.up(ideaId) : keys.down(ideaId));

    if (existing === null) {
      await ctx.db.insert("votes", {
        boardId: board._id,
        ideaId,
        userId: user._id,
        value,
      });
      await counter.inc(ctx, keyFor(value));
    } else if (existing.value === value) {
      await ctx.db.delete(existing._id);
      await counter.dec(ctx, keyFor(value));
    } else {
      await ctx.db.patch(existing._id, { value });
      await counter.dec(ctx, keyFor(existing.value));
      await counter.inc(ctx, keyFor(value));
    }
    if (board.creatorId !== user._id) {
      await touchParticipant(ctx, board._id, user._id);
    }
    return null;
  },
});

export const addComment = zMutation({
  args: {
    ideaId: zid("ideas"),
    body: z.string().trim().min(1).max(1000),
  },
  returns: zid("comments"),
  handler: async (ctx, { ideaId, body }) => {
    const user = await requireUser(ctx);
    const idea = await ctx.db.get(ideaId);
    if (idea === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Idea not found" });
    }
    const board = await ctx.db.get(idea.boardId);
    if (board === null || !board.commentsEnabled) {
      throw new ConvexError({
        code: "DISABLED",
        message: "Comments are off for this board",
      });
    }
    const commentId = await ctx.db.insert("comments", {
      boardId: board._id,
      ideaId,
      authorId: user._id,
      body,
    });
    await counter.inc(ctx, keys.comments(ideaId));
    if (board.creatorId !== user._id) {
      await touchParticipant(ctx, board._id, user._id);
    }
    return commentId;
  },
});

export const listComments = zQuery({
  args: { ideaId: zid("ideas") },
  returns: z.array(
    z.object({
      _id: zid("comments"),
      _creationTime: z.number(),
      body: z.string(),
      authorName: z.string(),
      isCreator: z.boolean(),
    }),
  ),
  handler: async (ctx, { ideaId }) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_idea", (q) => q.eq("ideaId", ideaId))
      .order("asc")
      .take(200);
    return await Promise.all(
      comments.map(async (c) => {
        const author = await ctx.db.get(c.authorId);
        return {
          _id: c._id,
          _creationTime: c._creationTime,
          body: c.body,
          authorName: author?.displayName ?? "Unknown",
          isCreator: author?.role === "creator",
        };
      }),
    );
  },
});
