import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { ChevronDown, ChevronUp, Loader2, MessageSquare, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { Skeleton } from '#/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { ConfirmDialog } from '#/components/ConfirmDialog'
import { cn } from '#/lib/utils'
import type { IdeaView } from './types'

/** One idea as a list row: votes · title/pitch · comments. */
export function IdeaCard({
  idea,
  myVote,
  votesEnabled,
  commentsEnabled,
  canInteract,
  canDelete,
}: {
  idea: IdeaView
  myVote: 1 | -1 | null
  votesEnabled: boolean
  commentsEnabled: boolean
  canInteract: boolean
  canDelete?: boolean
}) {
  const castVote = useMutation(api.ideas.castVote)
  const remove = useMutation(api.ideas.remove)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const voteDisabled = !votesEnabled || !canInteract
  const voteHint = !votesEnabled ? 'Voting is off for this board' : !canInteract ? 'Connecting…' : null

  async function vote(value: 1 | -1) {
    try {
      await castVote({ ideaId: idea._id, value })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className={cn('group -mx-2 rounded-md transition-colors hover:bg-accent/60', open && 'bg-accent/40')}>
      <div className="flex items-start gap-2 px-2 py-2">
        {/* Votes */}
        <div className="flex shrink-0 items-center gap-0.5 pt-px">
          <VoteButton dir="up" active={myVote === 1} disabled={voteDisabled} onClick={() => vote(1)} hint={voteHint ?? 'Upvote'} />
          <span
            className={cn(
              'tabular w-7 text-center text-xs',
              idea.score === 0 ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {idea.score > 0 ? `+${idea.score}` : idea.score}
          </span>
          <VoteButton dir="down" active={myVote === -1} disabled={voteDisabled} onClick={() => vote(-1)} hint={voteHint ?? 'Downvote'} />
        </div>

        {/* Title + pitch */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <p className="leading-6 font-medium">{idea.title}</p>
          {idea.pitch ? (
            <p
              className={cn(
                'text-[13px] leading-5 text-muted-foreground',
                expanded ? 'whitespace-pre-wrap' : 'line-clamp-2',
              )}
            >
              {idea.pitch}
            </p>
          ) : null}
        </button>

        {/* Right-hand meta */}
        <div className="flex shrink-0 items-center gap-0.5 pt-px">
          <Button
            variant="ghost"
            size="xs"
            className={cn('text-muted-foreground', open && 'text-foreground')}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={`${idea.comments} ${idea.comments === 1 ? 'comment' : 'comments'}`}
          >
            <MessageSquare className="size-3.5" /> <span className="tabular">{idea.comments}</span>
          </Button>
          {canDelete ? (
            <ConfirmDialog
              title={`Delete “${idea.title}”?`}
              description="This removes the idea, its votes and its comments for everyone. It can’t be undone."
              confirmLabel="Delete idea"
              destructive
              onConfirm={() => remove({ ideaId: idea._id })}
              trigger={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Delete idea"
                  className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                >
                  <Trash2 />
                </Button>
              }
            />
          ) : null}
        </div>
      </div>
      {open ? <Comments ideaId={idea._id} enabled={commentsEnabled} canInteract={canInteract} /> : null}
    </div>
  )
}

function VoteButton({
  dir,
  active,
  disabled,
  onClick,
  hint,
}: {
  dir: 'up' | 'down'
  active: boolean
  disabled: boolean
  onClick: () => void
  hint: string
}) {
  const Icon = dir === 'up' ? ChevronUp : ChevronDown
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={dir === 'up' ? 'Upvote' : 'Downvote'}
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
            className={cn(
              'text-muted-foreground hover:text-foreground',
              active && dir === 'up' && 'bg-accent text-up hover:text-up',
              active && dir === 'down' && 'bg-accent text-down hover:text-down',
            )}
          >
            <Icon className="size-4" strokeWidth={2} />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side={dir === 'up' ? 'top' : 'bottom'}>{hint}</TooltipContent>
    </Tooltip>
  )
}

function Comments({ ideaId, enabled, canInteract }: { ideaId: IdeaView['_id']; enabled: boolean; canInteract: boolean }) {
  const comments = useQuery(api.ideas.listComments, { ideaId })
  const add = useMutation(api.ideas.addComment)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="space-y-3 px-2 pt-1 pb-3 pl-[4.75rem]">
      {comments === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {comments.map((c) => (
            <li key={c._id} className="text-[13px] leading-5">
              <span className={cn('mr-2 font-medium', c.isCreator ? 'text-foreground' : 'text-muted-foreground')}>
                {c.authorName}
                {c.isCreator ? ' · creator' : ''}
              </span>
              <span className="whitespace-pre-wrap">{c.body}</span>
            </li>
          ))}
        </ul>
      )}
      {enabled ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              await add({ ideaId, body })
              setBody('')
            } catch (err) {
              toast.error(errorMessage(err))
            } finally {
              setBusy(false)
            }
          }}
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={canInteract ? 'Add a comment…' : 'Connecting…'}
            disabled={!canInteract || busy}
            className="min-h-0 bg-card text-[13px]"
          />
          <div className="flex items-center justify-end">
            <Button type="submit" size="xs" variant="outline" disabled={!canInteract || busy || body.trim().length === 0}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Comment
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Comments are off for this board.</p>
      )}
    </div>
  )
}

export function errorMessage(e: unknown): string {
  if (e instanceof ConvexError) {
    const data = e.data as { message?: string } | string
    if (typeof data === 'string') return data
    return data.message ?? 'Something went wrong'
  }
  return e instanceof Error ? e.message : 'Something went wrong'
}
