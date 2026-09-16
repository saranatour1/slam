import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { counter, keys } from "./counters";
import { requireBoardOwner, requireUser, touchParticipant } from "./lib/auth";
import { pick } from "./lib/validators";
import schema, { vote } from "./schema";

export const add = mutation({
  args: { boardId: v.id("boards"), title: v.string(), pitch: v.string() },
  returns: v.id("ideas"),
  handler: async (ctx, { boardId, title, pitch }) => {
    await requireBoardOwner(ctx, boardId);
    const t = title.trim();
    const p = pitch.trim();
    if (t.length === 0 || t.length > 120) {
      throw new ConvexError({ code: "INVALID", message: "Title must be 1-120 chars" });
    }
    if (p.length > 2000) {
      throw new ConvexError({ code: "INVALID", message: "Pitch too long (2000 max)" });
    }
    return await ctx.db.insert("ideas", { boardId, title: t, pitch: p });
  },
});

export const remove = mutation({
  args: { ideaId: v.id("ideas") },
  returns: v.null(),
  handler: async (ctx, { ideaId }) => {
    const idea = await ctx.db.get(ideaId);
    if (idea === null) return null;
    await requireBoardOwner(ctx, idea.boardId);
    await ctx.db.delete(ideaId);
    return null;
  },
});

/**
 * Toggle-style voting: same value again removes the vote, the other value
 * flips it. Tallies live in the sharded counter so bursts don't contend.
 */
export const castVote = mutation({
  args: { ideaId: v.id("ideas"), value: vote },
  returns: v.null(),
  handler: async (ctx, { ideaId, value }) => {
    const user = await requireUser(ctx);
    const idea = await ctx.db.get(ideaId);
    if (idea === null) throw new ConvexError({ code: "NOT_FOUND", message: "Idea not found" });
    const board = await ctx.db.get(idea.boardId);
    if (board === null || !board.votesEnabled) {
      throw new ConvexError({ code: "DISABLED", message: "Voting is off for this board" });
    }

    const existing = await ctx.db
      .query("votes")
      .withIndex("by_idea_user", (q) => q.eq("ideaId", ideaId).eq("userId", user._id))
      .unique();

    const keyFor = (v: 1 | -1) => (v === 1 ? keys.up(ideaId) : keys.down(ideaId));

    if (existing === null) {
      await ctx.db.insert("votes", { boardId: board._id, ideaId, userId: user._id, value });
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

export const addComment = mutation({
  args: { ideaId: v.id("ideas"), body: v.string() },
  returns: v.id("comments"),
  handler: async (ctx, { ideaId, body }) => {
    const user = await requireUser(ctx);
    const idea = await ctx.db.get(ideaId);
    if (idea === null) throw new ConvexError({ code: "NOT_FOUND", message: "Idea not found" });
    const board = await ctx.db.get(idea.boardId);
    if (board === null || !board.commentsEnabled) {
      throw new ConvexError({ code: "DISABLED", message: "Comments are off for this board" });
    }
    const text = body.trim();
    if (text.length === 0 || text.length > 1000) {
      throw new ConvexError({ code: "INVALID", message: "Comment must be 1-1000 chars" });
    }
    const commentId = await ctx.db.insert("comments", {
      boardId: board._id,
      ideaId,
      authorId: user._id,
      body: text,
    });
    await counter.inc(ctx, keys.comments(ideaId));
    if (board.creatorId !== user._id) {
      await touchParticipant(ctx, board._id, user._id);
    }
    return commentId;
  },
});

export const listComments = query({
  args: { ideaId: v.id("ideas") },
  returns: v.array(
    v.object({
      ...pick(schema.tables.comments.validator.fields, ["body"]),
      _id: v.id("comments"),
      _creationTime: v.number(),
      authorName: v.string(),
      isCreator: v.boolean(),
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
