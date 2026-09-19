import { defineSchema } from "convex/server";
import { boardsTable } from "./boards/_schema";
import { commentsTable } from "./comments/_schema";
import { exportsTable } from "./exports/_schema";
import { ideasTable } from "./ideas/_schema";
import { jevJudgmentsTable } from "./jev/_schema";
import { participantsTable } from "./participants/_schema";
import { pollResultsTable } from "./pollResults/_schema";
import { pollVotesTable } from "./pollVotes/_schema";
import { pollsTable } from "./polls/_schema";
import { usersTable } from "./users/_schema";
import { votesTable } from "./votes/_schema";

export default defineSchema({
  users: usersTable,
  boards: boardsTable,
  ideas: ideasTable,
  comments: commentsTable,
  votes: votesTable,
  polls: pollsTable,
  pollVotes: pollVotesTable,
  pollResults: pollResultsTable,
  exports: exportsTable,
  jevJudgments: jevJudgmentsTable,
  participants: participantsTable,
});
