import { randomDisplayName } from "../lib/names";
import { z, zid, zInternalMutation } from "../lib/z";

/** Called by Convex Auth the first time a username+password account signs up. */
export const createCreator = zInternalMutation({
  args: {
    provider: z.literal("password"),
    providerAccountId: z.string(),
    profile: z.object({ username: z.string() }),
  },
  returns: zid("users"),
  handler: async (ctx, { profile }) => {
    return await ctx.db.insert("users", {
      role: "creator",
      displayName: profile.username,
      isAnonymous: false,
    });
  },
});

/** Called by Convex Auth on every anonymous sign-in (each one is a new account). */
export const createParticipant = zInternalMutation({
  args: {
    provider: z.literal("anonymous"),
    providerAccountId: z.string(),
    profile: z.object({}),
  },
  returns: zid("users"),
  handler: async (ctx) => {
    return await ctx.db.insert("users", {
      role: "participant",
      displayName: randomDisplayName(),
      isAnonymous: true,
    });
  },
});
