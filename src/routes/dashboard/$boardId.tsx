import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Authenticated, AuthLoading, Unauthenticated } from '@convex-dev/auth/react'
import { useMutation, useQuery } from 'convex/react'
import { ArrowLeft, Check, Copy, ExternalLink, Loader2, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { CreatorSignIn } from '#/components/CreatorSignIn'
import { initials } from '#/components/Nav'
import { IdeaCard, errorMessage } from '#/components/board/IdeaCard'
import { PollCard } from '#/components/board/PollCard'
import { ResultsCard } from '#/components/board/ResultsCard'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Skeleton } from '#/components/ui/skeleton'
import { Switch } from '#/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Textarea } from '#/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { cn } from '#/lib/utils'
import { formatAgo, useNow } from '#/lib/time'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/dashboard/$boardId')({
  head: () => seo({ title: 'Board', path: '/dashboard', noIndex: true }),
  component: BoardAdmin,
})

function BoardAdmin() {
  return (
    <>
      <AuthLoading>
        <PageSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <div className="mx-auto max-w-sm pt-8">
          <CreatorSignIn compact />
        </div>
      </Unauthenticated>
      <Authenticated>
        <BoardAdminInner />
      </Authenticated>
    </>
  )
}

function BoardAdminInner() {
  const { boardId } = Route.useParams()
  const data = useQuery(api.boards.getMine, { boardId: boardId as Id<'boards'> })
  const activity = useQuery(api.boards.myActivity, { boardId: boardId as Id<'boards'> })

  if (data === undefined) return <PageSkeleton />
  if (data === null) {
    return (
      <div className="mx-auto max-w-md space-y-2 py-16 text-center">
        <p className="text-base font-medium">Board not found</p>
        <p className="text-[13px] text-muted-foreground">It may have been deleted, or it isn’t yours.</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/dashboard">
            <ArrowLeft /> All boards
          </Link>
        </Button>
      </div>
    )
  }
  const { board, notifyEmail, participantCount } = data
  const publicPath = `/b/${board.slug}`
  const myVotes = new Map(activity?.votes.map((v) => [v.ideaId, v.value]) ?? [])
  const myPollVotes = new Map(activity?.pollVotes.map((p) => [p.pollId, p.optionId]) ?? [])
  const resultCount = board.closedPolls.filter((p) => p.resultsId).length

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_272px] lg:gap-12">
      <div className="min-w-0 space-y-6">
        <header>
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-3" /> Boards
          </Link>
          <h1 className="mt-3 text-xl leading-7 font-medium">{board.title}</h1>
          {board.description ? <p className="mt-1 text-[13px] text-muted-foreground">{board.description}</p> : null}

          {/* Properties row */}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <Chip>
              <Users className="size-3.5 text-muted-foreground" />
              <span className="tabular">{participantCount}</span> {participantCount === 1 ? 'participant' : 'participants'}
            </Chip>
            <Chip>
              <span className={cn('dot', board.votesEnabled ? 'bg-live' : 'bg-input')} aria-hidden />
              Votes {board.votesEnabled ? 'on' : 'off'}
            </Chip>
            <Chip>
              <span className={cn('dot', board.commentsEnabled ? 'bg-live' : 'bg-input')} aria-hidden />
              Comments {board.commentsEnabled ? 'on' : 'off'}
            </Chip>
            <CopyLink path={publicPath} />
            <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
              <Link to="/b/$slug" params={{ slug: board.slug }}>
                <ExternalLink /> View
              </Link>
            </Button>
          </div>
        </header>

        <Tabs defaultValue="board" className="gap-5">
          <TabsList variant="line" className="w-full justify-start border-b">
            <TabsTrigger value="board" className="flex-none px-1 text-[13px]">
              Board
            </TabsTrigger>
            <TabsTrigger value="results" className="flex-none px-1 text-[13px]">
              Results{resultCount > 0 ? <span className="tabular ml-1 text-muted-foreground">{resultCount}</span> : null}
            </TabsTrigger>
            <TabsTrigger value="sessions" className="flex-none px-1 text-[13px]">
              Sessions{participantCount > 0 ? <span className="tabular ml-1 text-muted-foreground">{participantCount}</span> : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="board" className="space-y-6">
            {board.activePoll ? (
              <PollCard poll={board.activePoll} myOptionId={myPollVotes.get(board.activePoll._id) ?? null} canInteract isOwner />
            ) : (
              <NewPoll boardId={board._id} />
            )}

            <section>
              <div className="flex items-baseline justify-between text-[13px]">
                <h2 className="font-medium">Ideas</h2>
                <span className="tabular text-muted-foreground">{board.ideas.length}</span>
              </div>
              <div className="mt-1">
                <AddIdea boardId={board._id} />
                {board.ideas.length === 0 ? (
                  <p className="py-4 text-[13px] text-muted-foreground">No ideas yet. Post the first one above.</p>
                ) : (
                  board.ideas.map((idea) => (
                    <IdeaCard
                      key={idea._id}
                      idea={idea}
                      myVote={myVotes.get(idea._id) ?? null}
                      votesEnabled={board.votesEnabled}
                      commentsEnabled={board.commentsEnabled}
                      canInteract
                      canDelete
                    />
                  ))
                )}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="results" className="space-y-3">
            {resultCount === 0 ? (
              <p className="py-4 text-[13px] text-muted-foreground">Results appear here once a poll closes.</p>
            ) : (
              board.closedPolls.map((p) =>
                p.resultsId ? <ResultsCard key={p._id} resultsId={p.resultsId} isOwner notifyEmail={notifyEmail} /> : null,
              )
            )}
          </TabsContent>

          <TabsContent value="sessions">
            <Participants boardId={board._id} />
          </TabsContent>
        </Tabs>
      </div>

      <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
        <Panel title="Properties">
          <div className="prop-row">
            <span className="prop-label">Status</span>
            <span className="inline-flex items-center gap-2">
              <span className={cn('dot', board.activePoll ? 'bg-live' : 'bg-input')} aria-hidden />
              {board.activePoll ? 'Poll live' : 'No poll running'}
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Participants</span>
            <span className="tabular">{participantCount}</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Ideas</span>
            <span className="tabular">{board.ideas.length}</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Results</span>
            <span className="tabular">{resultCount}</span>
          </div>
          <div className="prop-row">
            <span className="prop-label">Link</span>
            <span className="tabular truncate">{publicPath}</span>
          </div>
        </Panel>
        <Settings boardId={board._id} votesEnabled={board.votesEnabled} commentsEnabled={board.commentsEnabled} notifyEmail={notifyEmail ?? ''} />
      </aside>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card px-4 py-3">
      <h2 className="mb-1 text-[13px] font-medium">{title}</h2>
      {children}
    </section>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[13px]">{children}</span>
}

function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={async () => {
            await navigator.clipboard.writeText(`${window.location.origin}${path}`)
            setCopied(true)
            toast.success('Board link copied')
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check /> : <Copy />} Copy link
        </Button>
      </TooltipTrigger>
      <TooltipContent className="tabular">{path}</TooltipContent>
    </Tooltip>
  )
}

function Settings({
  boardId,
  votesEnabled,
  commentsEnabled,
  notifyEmail,
}: {
  boardId: Id<'boards'>
  votesEnabled: boolean
  commentsEnabled: boolean
  notifyEmail: string
}) {
  const update = useMutation(api.boards.updateSettings)
  const [email, setEmail] = useState(notifyEmail)
  const [saving, setSaving] = useState(false)
  const dirty = email !== notifyEmail

  async function toggle(patch: { votesEnabled?: boolean; commentsEnabled?: boolean }) {
    try {
      await update({ boardId, ...patch })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Panel title="Settings">
      <div className="prop-row">
        <Label htmlFor="votes" className="prop-label font-normal">
          Voting
        </Label>
        <div>
          <Switch id="votes" size="sm" checked={votesEnabled} onCheckedChange={(v) => void toggle({ votesEnabled: v })} />
        </div>
      </div>
      <div className="prop-row">
        <Label htmlFor="comments" className="prop-label font-normal">
          Comments
        </Label>
        <div>
          <Switch id="comments" size="sm" checked={commentsEnabled} onCheckedChange={(v) => void toggle({ commentsEnabled: v })} />
        </div>
      </div>
      <form
        className="mt-2 space-y-2"
        onSubmit={async (e) => {
          e.preventDefault()
          setSaving(true)
          try {
            await update({ boardId, notifyEmail: email })
            toast.success('Notify email saved')
          } catch (err) {
            toast.error(errorMessage(err))
          } finally {
            setSaving(false)
          }
        }}
      >
        <Label htmlFor="notifyEmail" className="prop-label text-[13px] font-normal">
          Email results to
        </Label>
        <div className="flex gap-1.5">
          <Input id="notifyEmail" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-7 text-[13px]" />
          <Button type="submit" variant={dirty ? 'default' : 'outline'} size="xs" className="h-7" disabled={saving || !dirty}>
            {saving ? <Loader2 className="animate-spin" /> : 'Save'}
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Used when you email a closed poll. The sending account is configured on the server.
        </p>
      </form>
    </Panel>
  )
}

function AddIdea({ boardId }: { boardId: Id<'boards'> }) {
  const add = useMutation(api.ideas.add)
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState('')
  const [pitch, setPitch] = useState('')
  const [busy, setBusy] = useState(false)

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="-mx-2 flex h-9 w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <Plus className="size-3.5" /> Add an idea
      </button>
    )
  }

  return (
    <form
      className="my-2 flex flex-col gap-2 rounded-md bg-muted/70 p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          await add({ boardId, title, pitch })
          setTitle('')
          setPitch('')
          setExpanded(false)
          toast.success('Idea posted')
        } catch (err) {
          toast.error(errorMessage(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      <Input placeholder="Idea title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required autoFocus className="h-8 bg-card font-medium" />
      <Textarea placeholder="Your pitch: why this, who it’s for, what it costs…" value={pitch} onChange={(e) => setPitch(e.target.value)} rows={3} maxLength={2000} className="bg-card text-[13px]" />
      <div className="flex items-center justify-end gap-1.5">
        <Button type="button" variant="ghost" size="xs" onClick={() => setExpanded(false)} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="xs" disabled={busy || title.trim().length === 0}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Post idea
        </Button>
      </div>
    </form>
  )
}

const DURATIONS = [
  { label: '15 min', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '1 day', minutes: 1440 },
  { label: '1 week', minutes: 10080 },
]

function NewPoll({ boardId }: { boardId: Id<'boards'> }) {
  const create = useMutation(api.polls.create)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState('')
  const [minutes, setMinutes] = useState(60)
  const [busy, setBusy] = useState(false)
  const optionCount = options.split('\n').filter((l) => l.trim()).length

  return (
    <section className="rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-medium">Start a poll</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Opens immediately and closes itself when the timer ends. Results are frozen at close.</p>
      </div>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await create({ boardId, question, options: options.split('\n'), durationMinutes: minutes })
            setQuestion('')
            setOptions('')
            toast.success('Poll is live')
          } catch (err) {
            toast.error(errorMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="question" className="text-[13px]">
            Question
          </Label>
          <Input id="question" placeholder="Which idea should I build first?" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} required className="h-8" />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="options" className="text-[13px]">
              Options
            </Label>
            <span className="text-xs text-muted-foreground">one per line{optionCount > 0 ? ` · ${optionCount}` : ''}</span>
          </div>
          <Textarea id="options" placeholder={'Option A\nOption B\nOption C'} value={options} onChange={(e) => setOptions(e.target.value)} rows={4} required className="text-[13px]" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[13px]">Duration</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {DURATIONS.map((d) => (
              <Button key={d.minutes} type="button" size="xs" variant={minutes === d.minutes ? 'secondary' : 'ghost'} onClick={() => setMinutes(d.minutes)}>
                {d.label}
              </Button>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <Input
                aria-label="Custom duration in minutes"
                type="number"
                min={1}
                max={43200}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="tabular h-7 w-20"
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={busy || question.trim().length === 0 || optionCount < 2}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Open poll
          </Button>
        </div>
      </form>
    </section>
  )
}

function Participants({ boardId }: { boardId: Id<'boards'> }) {
  const rows = useQuery(api.boards.listParticipants, { boardId })
  const now = useNow(15_000)
  if (rows === undefined) {
    return (
      <div className="space-y-2 py-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    )
  }
  if (rows.length === 0) {
    return <p className="py-4 text-[13px] text-muted-foreground">Nobody has joined yet. Share the link.</p>
  }
  return (
    <Table className="text-[13px]">
      <TableHeader className="[&_tr]:border-0">
        <TableRow className="border-0 hover:bg-transparent">
          <TableHead className="h-8 text-xs font-normal text-muted-foreground">Name</TableHead>
          <TableHead className="h-8 text-right text-xs font-normal text-muted-foreground">Votes</TableHead>
          <TableHead className="h-8 text-right text-xs font-normal text-muted-foreground">Comments</TableHead>
          <TableHead className="h-8 text-right text-xs font-normal text-muted-foreground">Poll</TableHead>
          <TableHead className="h-8 text-right text-xs font-normal text-muted-foreground">Last seen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const online = now - r.lastSeenAt < 2 * 60_000
          return (
            <TableRow key={r.userId} className="border-0 hover:bg-accent/60">
              <TableCell className="py-1.5">
                <div className="flex items-center gap-2">
                  <Avatar className="size-5">
                    <AvatarFallback className="bg-secondary text-[9px] font-medium">{initials(r.displayName)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{r.displayName}</span>
                  {online ? <span className="dot ml-1 bg-live" aria-label="online" /> : null}
                </div>
              </TableCell>
              <TableCell className="tabular py-1.5 text-right">{r.votes}</TableCell>
              <TableCell className="tabular py-1.5 text-right">{r.comments}</TableCell>
              <TableCell className="tabular py-1.5 text-right">{r.pollVotes}</TableCell>
              <TableCell className="py-1.5 text-right text-xs text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger className="tabular">{formatAgo(r.lastSeenAt, now)}</TooltipTrigger>
                  <TooltipContent>Joined {formatAgo(r.joinedAt, now)}</TooltipContent>
                </Tooltip>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function PageSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_272px] lg:gap-12">
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-7 w-80" />
        </div>
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  )
}
