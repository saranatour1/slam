import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'

export type BoardView = NonNullable<FunctionReturnType<typeof api.boards.getBySlug>>
export type IdeaView = BoardView['ideas'][number]
export type PollView = NonNullable<BoardView['activePoll']>
export type ActivityView = NonNullable<FunctionReturnType<typeof api.boards.myActivity>>
export type ResultsView = NonNullable<FunctionReturnType<typeof api.polls.getResults>>
