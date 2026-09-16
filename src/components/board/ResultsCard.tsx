import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Check, ChevronDown, ExternalLink, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/time'
import { errorMessage } from './IdeaCard'

export function ResultsCard({
  resultsId,
  isOwner,
  notifyEmail,
}: {
  resultsId: Id<'pollResults'>
  isOwner?: boolean
  notifyEmail?: string
}) {
  const results = useQuery(api.polls.getResults, { resultsId })
  const emailResults = useMutation(api.exports.emailResults)
  const linearResults = useMutation(api.exports.linearResults)
  const [busy, setBusy] = useState<'email' | 'linear' | null>(null)
  const [showIdeas, setShowIdeas] = useState(false)

  if (results === undefined) return <Skeleton className="h-40 w-full" />
  if (results === null) return null

  const sorted = [...results.totals].sort((a, b) => b.count - a.count)
  const winner = results.totalVotes > 0 ? sorted[0] : null

  async function run(kind: 'email' | 'linear') {
    setBusy(kind)
    try {
      if (kind === 'email') {
        await emailResults({ resultsId })
        toast.success(`Sending to ${notifyEmail}…`)
      } else {
        await linearResults({ resultsId })
        toast.success('Sending to Linear…')
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="dot bg-muted-foreground/50" aria-hidden />
          Closed · <span className="tabular">{formatDate(results.closedAt)}</span>
        </span>
        <span>
          <span className="tabular">{results.totalVotes}</span> vote{results.totalVotes === 1 ? '' : 's'} ·{' '}
          <span className="tabular">{results.participants}</span> participant{results.participants === 1 ? '' : 's'}
        </span>
      </div>
      <h3 className="mt-2 text-[15px] leading-6 font-medium">{results.question}</h3>

      {winner ? null : <p className="mt-2 text-[13px] text-muted-foreground">No votes were cast before the poll closed.</p>}

      <ul className="mt-3 space-y-1">
        {sorted.map((t, i) => {
          const pct = results.totalVotes === 0 ? 0 : Math.round((t.count / results.totalVotes) * 100)
          const won = i === 0 && pct > 0
          return (
            <li key={t.optionId} className="relative flex h-8 items-center gap-2.5 overflow-hidden rounded-md px-2.5 text-[13px]">
              <span aria-hidden className={cn('absolute inset-y-0 left-0 rounded-md', won ? 'bg-accent' : 'bg-muted')} style={{ width: `${pct}%` }} />
              <span className="relative flex size-4 shrink-0 items-center justify-center">
                {won ? <Check className="size-3.5" strokeWidth={2.5} /> : <span className="dot bg-input" aria-hidden />}
              </span>
              <span className={cn('relative flex-1 truncate', won && 'font-medium')}>{t.label}</span>
              <span className={cn('tabular relative text-xs', won ? 'text-foreground' : 'text-muted-foreground')}>
                {t.count} · {pct}%
              </span>
            </li>
          )
        })}
      </ul>

      {results.ideas.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowIdeas((s) => !s)}
            className="flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className={cn('size-3.5 transition-transform', showIdeas && 'rotate-180')} />
            Idea standings at close ({results.ideas.length})
          </button>
          {showIdeas ? (
            <ol className="mt-2 space-y-px">
              {results.ideas.map((i, idx) => (
                <li key={i.ideaId} className="flex h-7 items-center gap-3 rounded-md px-2 text-[13px] hover:bg-accent/60">
                  <span className="tabular w-4 text-xs text-muted-foreground">{idx + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{i.title}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {i.score >= 0 ? '+' : ''}
                    {i.score} · ▲{i.up} ▼{i.down} · {i.comments}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      {isOwner ? (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="xs" variant="outline" disabled={busy !== null || !notifyEmail} onClick={() => run('email')}>
                    {busy === 'email' ? <Loader2 className="animate-spin" /> : <Mail />} Email results
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{notifyEmail ? `Send to ${notifyEmail}` : 'Set a notify email in settings first'}</TooltipContent>
            </Tooltip>
            <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => run('linear')}>
              {busy === 'linear' ? <Loader2 className="animate-spin" /> : <ExternalLink />} Send to Linear
            </Button>
          </div>
          {results.exports.length > 0 ? (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {results.exports.map((e) => (
                <li key={e._id} className="flex flex-wrap items-center gap-x-2">
                  <span className="tabular">{formatDate(e._creationTime)}</span>
                  <span>·</span>
                  <span className="capitalize">{e.kind}</span>
                  <span>→</span>
                  <span className="truncate">{e.target}</span>
                  <span>·</span>
                  {e.status === 'sent' ? (
                    e.externalUrl ? (
                      <a className="text-foreground underline-offset-2 hover:underline" href={e.externalUrl} target="_blank" rel="noreferrer">
                        sent ↗
                      </a>
                    ) : (
                      <span className="text-foreground">sent</span>
                    )
                  ) : (
                    <span className="text-destructive">failed: {e.error}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
