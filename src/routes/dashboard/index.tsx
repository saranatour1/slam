import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Authenticated, AuthLoading, Unauthenticated } from '@convex-dev/auth/react'
import { useMutation, useQuery } from 'convex/react'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { CreatorSignIn } from '#/components/CreatorSignIn'
import { errorMessage } from '#/components/board/IdeaCard'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { cn } from '#/lib/utils'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/dashboard/')({
  head: () => seo({ title: 'Dashboard', path: '/dashboard', noIndex: true }),
  component: Dashboard,
})

function Dashboard() {
  return (
    <>
      <AuthLoading>
        <BoardsSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <div className="mx-auto max-w-sm pt-8">
          <CreatorSignIn compact />
        </div>
      </Unauthenticated>
      <Authenticated>
        <Boards />
      </Authenticated>
    </>
  )
}

function Boards() {
  const me = useQuery(api.users.me)
  const boards = useQuery(api.boards.listMine)

  if (me && me.role !== 'creator') {
    return (
      <div className="mx-auto max-w-md space-y-2 pt-12 text-center">
        <h1 className="text-base font-medium">You’re browsing as {me.displayName}</h1>
        <p className="text-[13px] text-muted-foreground">
          Boards belong to creator accounts. Sign out from the menu, then sign in or sign up as a creator.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-medium">Boards</h1>
          {boards ? <span className="tabular text-[13px] text-muted-foreground">{boards.length}</span> : null}
        </div>
        <NewBoardDialog />
      </header>

      {boards === undefined ? (
        <BoardsSkeleton />
      ) : boards.length === 0 ? (
        <p className="py-10 text-[13px] text-muted-foreground">
          No boards yet. A board holds your ideas, one live poll at a time, and every frozen result.
        </p>
      ) : (
        <ul className="-mx-2">
          {boards.map((b) => (
            <li key={b._id}>
              <Link
                to="/dashboard/$boardId"
                params={{ boardId: b._id }}
                className="flex h-10 items-center gap-4 rounded-md px-2 transition-colors hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{b.title}</span>
                <span className="tabular hidden text-xs text-muted-foreground sm:inline">/b/{b.slug}</span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Flag on={b.votesEnabled} label="votes" />
                  <Flag on={b.commentsEnabled} label="comments" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', !on && 'opacity-60')}>
      <span className={cn('dot', on ? 'bg-live' : 'bg-input')} aria-hidden />
      {label}
    </span>
  )
}

function BoardsSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-10 rounded-md" />
      ))}
    </div>
  )
}

function NewBoardDialog() {
  const create = useMutation(api.boards.create)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> New board
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              const { boardId } = await create({ title, description: description || undefined })
              setTitle('')
              setDescription('')
              setOpen(false)
              toast.success('Board created')
              void navigate({ to: '/dashboard/$boardId', params: { boardId } })
            } catch (err) {
              toast.error(errorMessage(err))
            } finally {
              setBusy(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-medium">New board</DialogTitle>
            <DialogDescription>Give it a name people will recognise from the link.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="title" className="text-[13px]">
                Title
              </Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} autoFocus placeholder="Q4 product bets" className="h-8" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="description" className="text-[13px]">
                Description <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} placeholder="What are we deciding, and by when?" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || title.trim().length === 0}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Create board
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
