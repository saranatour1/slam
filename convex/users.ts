import { currentUser } from "./lib/auth";
import { z, zQuery } from "./lib/z";
import { userPublic } from "./users/_schema";

export const me = zQuery({
  args: {},
  returns: z.union([z.null(), userPublic]),
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
