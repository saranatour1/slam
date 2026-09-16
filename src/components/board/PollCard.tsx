import { useMutation } from 'convex/react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import { ConfirmDialog } from '#/components/ConfirmDialog'
import { cn } from '#/lib/utils'
import { formatCountdown, useNow } from '#/lib/time'
import { errorMessage } from './IdeaCard'
import type { PollView } from './types'

export function PollCard({
  poll,
  myOptionId,
  canInteract,
  isOwner,
}: {
  poll: PollView
  myOptionId: string | null
  canInteract: boolean
  isOwner?: boolean
}) {
  const now = useNow()
  const castVote = useMutation(api.polls.castVote)
  const endNow = useMutation(api.polls.endNow)
  const remaining = poll.endsAt - now
  const closed = remaining <= 0
  const leader = poll.options.reduce<PollView['options'][number] | null>(
    (best, o) => (o.count > 0 && (!best || o.count > best.count) ? o : best),
    null,
  )

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="dot bg-live" aria-hidden />
          Live · {closed ? 'closing…' : <>closes in <span className="tabular">{formatCountdown(remaining)}</span></>}
        </span>
        <span>
          <span className="tabular">{poll.totalVotes}</span> vote{poll.totalVotes === 1 ? '' : 's'}
        </span>
      </div>
      <h3 className="mt-2 text-[15px] leading-6 font-medium">{poll.question}</h3>

      <ul className="mt-3 space-y-1">
        {poll.options.map((o) => {
          const pct = poll.totalVotes === 0 ? 0 : Math.round((o.count / poll.totalVotes) * 100)
          const mine = myOptionId === o.id
          const leading = leader?.id === o.id
          return (
            <li key={o.id}>
              <button
                type="button"
                disabled={!canInteract || closed}
                onClick={async () => {
                  try {
                    await castVote({ pollId: poll._id, optionId: o.id })
                  } catch (e) {
                    toast.error(errorMessage(e))
                  }
                }}
                className={cn(
                  'relative flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-md px-2.5 text-left text-[13px] transition-colors',
                  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  'enabled:hover:bg-accent/60 disabled:cursor-default',
                )}
              >
                <span
                  aria-hidden
                  className={cn('absolute inset-y-0 left-0 rounded-md transition-[width] duration-500 ease-out', mine ? 'bg-accent' : 'bg-muted')}
                  style={{ width: `${pct}%` }}
                />
                <span className="relative flex size-4 shrink-0 items-center justify-center">
                  {mine ? <Check className="size-3.5" strokeWidth={2.5} /> : <span className="dot bg-input" aria-hidden />}
                </span>
                <span className={cn('relative flex-1 truncate', mine && 'font-medium')}>{o.label}</span>
                <span className={cn('tabular relative text-xs', leading ? 'text-foreground' : 'text-muted-foreground')}>
                  {o.count} · {pct}%
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="mt-2 text-xs text-muted-foreground">
        {myOptionId ? 'You can change your vote until it closes.' : canInteract ? 'Choose an option to vote.' : 'Connecting…'}
      </p>

      {isOwner ? (
        <div className="mt-3 flex justify-end">
          <ConfirmDialog
            title="End this poll now?"
            description="Voting stops immediately and the tallies are frozen into a result. You can then export it to Linear or email."
            confirmLabel="End poll"
            onConfirm={() => endNow({ pollId: poll._id })}
            trigger={
              <Button variant="outline" size="xs">
                End poll now
              </Button>
            }
          />
        </div>
      ) : null}
    </section>
  )
}
