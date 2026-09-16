import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { currentUser } from "./lib/auth";
import { randomDisplayName } from "./lib/names";
import schema from "./schema";

/** Called by Convex Auth the first time a username+password account signs up. */
export const createCreator = internalMutation({
  args: {
    provider: v.literal("password"),
    providerAccountId: v.string(),
    profile: v.object({ username: v.string() }),
  },
  returns: v.id("users"),
  handler: async (ctx, { profile }) => {
    return await ctx.db.insert("users", {
      role: "creator",
      displayName: profile.username,
      isAnonymous: false,
    });
  },
});

/** Called by Convex Auth on every anonymous sign-in (each one is a new account). */
export const createParticipant = internalMutation({
  args: {
    provider: v.literal("anonymous"),
    providerAccountId: v.string(),
    profile: v.object({}),
  },
  returns: v.id("users"),
  handler: async (ctx) => {
    return await ctx.db.insert("users", {
      role: "participant",
      displayName: randomDisplayName(),
      isAnonymous: true,
    });
  },
});

export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      ...schema.tables.users.validator.fields,
      _id: v.id("users"),
    }),
  ),
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (user === null) return null;
    return {
      _id: user._id,
      role: user.role,
      displayName: user.displayName,
      isAnonymous: user.isAnonymous,
    };
  },
});
