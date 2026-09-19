import { defineTable } from "convex/server";
import { z, zid, zodToConvexFields } from "../lib/z";

export const exportKind = z.enum(["linear", "email"]);
export const exportStatus = z.enum(["sent", "failed"]);

export const exportFields = {
  boardId: zid("boards"),
  resultsId: zid("pollResults"),
  kind: exportKind,
  status: exportStatus,
  target: z.string(),
  externalUrl: z.string().optional(),
  error: z.string().optional(),
};

export const exportsTable = defineTable(zodToConvexFields(exportFields)).index(
  "by_results",
  ["resultsId"],
);
