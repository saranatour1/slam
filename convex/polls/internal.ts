import { z, zid, zInternalMutation } from "../lib/z";
import { closePoll } from "./_helpers";

/** Scheduled at `endsAt`. Idempotent: a poll already closed is left alone. */
export const close = zInternalMutation({
  args: { pollId: zid("polls") },
  returns: z.null(),
  handler: async (ctx, { pollId }) => {
    await closePoll(ctx, pollId);
    return null;
  },
});
