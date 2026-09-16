import { ShardedCounter } from "@convex-dev/sharded-counter";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Small boards don't need many shards; 4 keeps reads cheap while still
// letting a burst of votes land without OCC retries.
export const counter = new ShardedCounter(components.shardedCounter, {
  defaultShards: 4,
});

export const keys = {
  up: (ideaId: Id<"ideas">) => `idea:${ideaId}:up`,
  down: (ideaId: Id<"ideas">) => `idea:${ideaId}:down`,
  comments: (ideaId: Id<"ideas">) => `idea:${ideaId}:comments`,
  pollOption: (pollId: Id<"polls">, optionId: string) =>
    `poll:${pollId}:${optionId}`,
  pollTotal: (pollId: Id<"polls">) => `poll:${pollId}:total`,
};
