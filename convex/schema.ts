import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const vote = v.union(v.literal(1), v.literal(-1));

export const pollOption = v.object({
  id: v.string(),
  label: v.string(),
});

export const pollStatus = v.union(v.literal("open"), v.literal("closed"));

export default defineSchema({
  // Convex Auth v2 owns accounts/sessions inside its component; this is the app's
  // own user row (one per account, anonymous or not).
  users: defineTable({
    role: v.union(v.literal("creator"), v.literal("participant")),
    displayName: v.string(),
    isAnonymous: v.boolean(),
  }).index("by_displayName",["displayName"]),

  boards: defineTable({
    creatorId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    slug: v.string(),
    commentsEnabled: v.boolean(),
    votesEnabled: v.boolean(),
    notifyEmail: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_creator", ["creatorId"]),

  ideas: defineTable({
    boardId: v.id("boards"),
    title: v.string(),
    pitch: v.string(),
  }).index("by_board", ["boardId"]),

  comments: defineTable({
    boardId: v.id("boards"),
    ideaId: v.id("ideas"),
    authorId: v.id("users"),
    body: v.string(),
  })
    .index("by_idea", ["ideaId"])
    .index("by_board_author", ["boardId", "authorId"]),

  votes: defineTable({
    boardId: v.id("boards"),
    ideaId: v.id("ideas"),
    userId: v.id("users"),
    value: vote,
  })
    .index("by_idea_user", ["ideaId", "userId"])
    .index("by_board_author", ["boardId", "userId"]),

  polls: defineTable({
    boardId: v.id("boards"),
    question: v.string(),
    options: v.array(pollOption),
    endsAt: v.number(),
    status: pollStatus,
    closeJobId: v.optional(v.id("_scheduled_functions")),
    resultsId: v.optional(v.id("pollResults")),
  }).index("by_board", ["boardId"]),

  pollVotes: defineTable({
    pollId: v.id("polls"),
    boardId: v.id("boards"),
    userId: v.id("users"),
    optionId: v.string(),
  })
    .index("by_poll_user", ["pollId", "userId"])
    .index("by_board_author", ["boardId", "userId"]),

  // Frozen snapshot written once when a poll closes. This is the persistent
  // "cache" of results: exports and result pages read from here, never recount.
  pollResults: defineTable({
    boardId: v.id("boards"),
    pollId: v.id("polls"),
    question: v.string(),
    closedAt: v.number(),
    totalVotes: v.number(),
    totals: v.array(
      v.object({ optionId: v.string(), label: v.string(), count: v.number() }),
    ),
    ideas: v.array(
      v.object({
        ideaId: v.id("ideas"),
        title: v.string(),
        up: v.number(),
        down: v.number(),
        score: v.number(),
        comments: v.number(),
      }),
    ),
    participants: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_poll", ["pollId"]),

  exports: defineTable({
    boardId: v.id("boards"),
    resultsId: v.id("pollResults"),
    kind: v.union(v.literal("linear"), v.literal("email")),
    status: v.union(v.literal("sent"), v.literal("failed")),
    target: v.string(),
    externalUrl: v.optional(v.string()),
    error: v.optional(v.string()),
  }).index("by_results", ["resultsId"]),

  // One row per anonymous user per board: the creator's "sessions" view.
  participants: defineTable({
    boardId: v.id("boards"),
    userId: v.id("users"),
    joinedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_board_user", ["boardId", "userId"]),
});
