import { useEffect, useRef } from 'react'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useConvexAuth } from '@convex-dev/auth/react'
import { useAnonymousAuth } from '@convex-dev/auth/providers/anonymous/react'
import { useMutation, useQuery } from 'convex/react'
import { Loader2, VenetianMask } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { IdeaCard } from '#/components/board/IdeaCard'
import { PollCard } from '#/components/board/PollCard'
import { ResultsCard } from '#/components/board/ResultsCard'
import { Button } from '#/components/ui/button'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/b/$slug')({
  loader: async ({ context, params }) => {
    const board = await context.queryClient.ensureQueryData(convexQuery(api.boards.getBySlug, { slug: params.slug }))
    if (board === null) throw notFound()
    return { title: board.title, description: board.description, slug: params.slug }
  },
  head: ({ loaderData, params }) => {
    const title = loaderData?.title ?? 'Board'
    const description =
      loaderData?.description?.trim() ||
      `Slam “${title}” anonymously — vote, comment, and poll.`
    return seo({ title, description, path: `/b/${loaderData?.slug ?? params.slug}` })
  },
  component: PublicBoard,
})

function PublicBoard() {
  const { slug } = Route.useParams()
  const { data: board } = useSuspenseQuery(convexQuery(api.boards.getBySlug, { slug }))
  const me = useQuery(api.users.me)
  const activity = useQuery(api.boards.myActivity, board ? { boardId: board._id } : 'skip')
  const { isAuthenticated } = useAutoAnonymousSession()
  const join = useMutation(api.boards.join)

  // Register this session on the board once we're signed in (any role).
  useEffect(() => {
    if (isAuthenticated && board) void join({ slug })
  }, [isAuthenticated, board?._id, slug])

  if (board === null) return null

  const isOwner = me?._id === board.creatorId
  const canInteract = isAuthenticated
  const myVotes = new Map(activity?.votes.map((v) => [v.ideaId, v.value]) ?? [])
  const myPollVotes = new Map(activity?.pollVotes.map((p) => [p.pollId, p.optionId]) ?? [])
  const interactionsOff = !board.votesEnabled && !board.commentsEnabled

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <div>
          <h1 className="text-xl leading-7 font-medium">{board.title}</h1>
          {board.description ? <p className="mt-1 text-[13px] text-muted-foreground">{board.description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted-foreground">
          <span>by {board.creatorName}</span>
          <span aria-hidden>·</span>
          <IdentityChip me={me} />
          {interactionsOff ? (
            <>
              <span aria-hidden>·</span>
              <span>read-only</span>
            </>
          ) : null}
          {isOwner ? (
            <Button asChild variant="outline" size="xs" className="ml-auto">
              <Link to="/dashboard/$boardId" params={{ boardId: board._id }}>
                Manage board
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      {board.activePoll ? (
        <PollCard poll={board.activePoll} myOptionId={myPollVotes.get(board.activePoll._id) ?? null} canInteract={canInteract} isOwner={isOwner} />
      ) : null}

      <section>
        <div className="flex items-baseline justify-between border-b pb-2 text-[13px]">
          <h2 className="font-medium">Ideas</h2>
          <span className="tabular text-muted-foreground">{board.ideas.length}</span>
        </div>
        {board.ideas.length === 0 ? (
          <p className="py-6 text-[13px] text-muted-foreground">Nothing posted yet. Check back soon.</p>
        ) : (
          <div className="pt-2">
            {board.ideas.map((idea) => (
              <IdeaCard
                key={idea._id}
                idea={idea}
                myVote={myVotes.get(idea._id) ?? null}
                votesEnabled={board.votesEnabled}
                commentsEnabled={board.commentsEnabled}
                canInteract={canInteract}
                canAskJev={isOwner}
              />
            ))}
          </div>
        )}
      </section>

      {board.closedPolls.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between border-b pb-2 text-[13px]">
            <h2 className="font-medium">Past polls</h2>
            <span className="tabular text-muted-foreground">{board.closedPolls.length}</span>
          </div>
          {board.closedPolls.map((p) => (p.resultsId ? <ResultsCard key={p._id} resultsId={p.resultsId} /> : null))}
        </section>
      ) : null}
    </div>
  )
}

function IdentityChip({ me }: { me: ReturnType<typeof useQuery<typeof api.users.me>> }) {
  if (!me) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Loader2 className="size-3 animate-spin" /> Joining anonymously…
      </span>
    )
  }
  if (me.isAnonymous) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <VenetianMask className="size-3.5" />
        You’re <span className="font-medium text-foreground">{me.displayName}</span>
        <span className="hidden sm:inline">(anonymous, this session only)</span>
      </span>
    )
  }
  return (
    <span>
      Signed in as <span className="font-medium text-foreground">{me.displayName}</span>
    </span>
  )
}

/** Signed-out visitors get an anonymous account automatically. */
function useAutoAnonymousSession() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { signInAnonymous } = useAnonymousAuth(api.auth.signInAnonymous)
  const started = useRef(false)
  useEffect(() => {
    if (isLoading || isAuthenticated || started.current) return
    started.current = true
    void signInAnonymous().catch((e) => {
      console.error('Anonymous sign-in failed', e)
      started.current = false
    })
  }, [isLoading, isAuthenticated, signInAnonymous])
  return { isAuthenticated }
}
