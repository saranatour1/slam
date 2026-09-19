import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { cn } from '#/lib/utils'
import { errorMessage } from './errors'
import type { IdeaView } from './types'

export type JevView = IdeaView['jev']

function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

function verdictLabel(verdict: 'yes' | 'no' | 'thoughts') {
  if (verdict === 'yes') return 'Yes'
  if (verdict === 'no') return 'No'
  return 'Thoughts'
}

function chipLabel(jev: NonNullable<JevView>) {
  if (jev.status === 'pending') return 'Jev'
  if (jev.status === 'failed') return 'Jev'
  if (jev.verdict) return `Jev ${verdictLabel(jev.verdict).toLowerCase()}`
  return 'Jev'
}

export function AskJevButton({
  ideaId,
  pending,
  firstAsk,
}: {
  ideaId: IdeaView['_id']
  pending?: boolean
  firstAsk?: boolean
}) {
  const evaluate = useMutation(api.jev.evaluateIdea)
  const [busy, setBusy] = useState(false)
  const disabled = pending || busy

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      disabled={disabled}
      onClick={async () => {
        setBusy(true)
        try {
          await evaluate({ ideaId })
          toast.success('Jev is judging this idea')
        } catch (e) {
          toast.error(errorMessage(e))
        } finally {
          setBusy(false)
        }
      }}
    >
      {disabled ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {pending || busy ? 'Judging…' : firstAsk ? 'Ask Jev' : 'Ask again'}
    </Button>
  )
}

export function JevDetails({
  jev,
  ideaId,
  canRerun,
  flush,
}: {
  jev: NonNullable<JevView>
  ideaId: IdeaView['_id']
  canRerun: boolean
  flush?: boolean
}) {
  return (
    <div className={cn('space-y-2 text-[13px]', !flush && 'px-2 pt-1 pb-3 pl-[4.75rem]')}>
      {jev.status === 'pending' ? (
        <p className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Jev is judging this idea…
        </p>
      ) : null}
      {jev.status === 'failed' ? (
        <p className="text-destructive">
          {canRerun ? jev.error || 'Jev couldn’t judge this idea.' : 'Jev couldn’t judge this idea.'}
        </p>
      ) : null}
      {jev.status === 'complete' ? (
        <div className="space-y-1.5">
          <p>
            <span className="font-medium">Jev · {jev.verdict ? verdictLabel(jev.verdict) : '—'}</span>
            {jev.verdictConfidence != null ? (
              <span className="tabular ml-1.5 text-muted-foreground">{pct(jev.verdictConfidence)} sure</span>
            ) : null}
          </p>
          {jev.worthPursuing != null ? (
            <p className="text-muted-foreground">
              Worth pursuing <span className="tabular text-foreground">{pct(jev.worthPursuing)}</span>
            </p>
          ) : null}
          {jev.thoughts ? (
            <p className="text-muted-foreground">
              Clarity <span className="tabular text-foreground">{pct(jev.thoughts.clarity.score)}</span>
              <span aria-hidden> · </span>
              Novelty <span className="tabular text-foreground">{pct(jev.thoughts.novelty.score)}</span>
              <span aria-hidden> · </span>
              Feasibility <span className="tabular text-foreground">{pct(jev.thoughts.feasibility.score)}</span>
            </p>
          ) : null}
        </div>
      ) : null}
      {canRerun ? (
        <div className="pt-1">
          <AskJevButton ideaId={ideaId} pending={jev.status === 'pending'} />
        </div>
      ) : null}
    </div>
  )
}

/** Compact chip on an idea row. Opens details; owners can ask Jev when missing. */
export function JevChip({
  jev,
  ideaId,
  canRerun,
  open,
  onToggle,
}: {
  jev: JevView
  ideaId: IdeaView['_id']
  canRerun: boolean
  open: boolean
  onToggle: () => void
}) {
  if (jev == null) {
    if (!canRerun) return null
    return <AskJevButton ideaId={ideaId} firstAsk />
  }

  const pending = jev.status === 'pending'
  const failed = jev.status === 'failed'
  const verdict = jev.status === 'complete' ? jev.verdict : undefined
  const label = chipLabel(jev)
  const hint = pending
    ? 'Jev is judging…'
    : failed
      ? canRerun
        ? jev.error || 'Jev failed'
        : 'Jev couldn’t judge this idea'
      : `Jev: ${verdict ? verdictLabel(verdict) : 'judgment'}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className={cn(
            'text-muted-foreground',
            open && 'text-foreground',
            verdict === 'yes' && 'text-up hover:text-up',
            verdict === 'no' && 'text-down hover:text-down',
            failed && 'text-destructive hover:text-destructive',
          )}
          aria-expanded={open}
          aria-label={hint}
          onClick={onToggle}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          <span>{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

/** Dashboard tab: every idea with its latest Jev judgment. */
export function JevBoardList({ ideas }: { ideas: IdeaView[] }) {
  if (ideas.length === 0) {
    return <p className="py-4 text-[13px] text-muted-foreground">Post an idea on the board and Jev will judge it.</p>
  }
  return (
    <ul>
      {ideas.map((idea) => (
        <li key={idea._id} className="border-b py-3 last:border-0">
          <p className="font-medium">{idea.title}</p>
          {idea.pitch ? <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{idea.pitch}</p> : null}
          <div className="mt-2">
            {idea.jev ? (
              <JevDetails jev={idea.jev} ideaId={idea._id} canRerun flush />
            ) : (
              <AskJevButton ideaId={idea._id} firstAsk />
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
