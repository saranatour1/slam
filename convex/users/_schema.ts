import { defineTable } from "convex/server";
import { z, zid, zodToConvexFields } from "../lib/z";

export const userRole = z.enum(["creator", "participant"]);

export const userFields = {
  role: userRole,
  displayName: z.string(),
  isAnonymous: z.boolean(),
};

export const usersTable = defineTable(zodToConvexFields(userFields)).index(
  "by_displayName",
  ["displayName"],
);

/** Public user payload (no `_creationTime`). */
export const userPublic = z.object({
  _id: zid("users"),
  role: userRole,
  displayName: z.string(),
  isAnonymous: z.boolean(),
});
