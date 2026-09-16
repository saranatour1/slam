import { createFileRoute, Link } from '@tanstack/react-router'
import { Authenticated, AuthLoading, Unauthenticated } from '@convex-dev/auth/react'
import { useQuery } from 'convex/react'
import { ArrowRight, MessageSquareText, Send, Timer, VenetianMask } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { CreatorSignIn } from '#/components/CreatorSignIn'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { seo } from '#/lib/seo'

export const Route = createFileRoute('/')({
  head: () => seo({ path: '/' }),
  component: Home,
})

const STEPS = [
  {
    icon: Send,
    title: 'Post ideas with a pitch',
    body: 'You’re the only one who signs in. Add ideas, write the pitch, share one link.',
  },
  {
    icon: VenetianMask,
    title: 'Everyone else is anonymous',
    body: 'Visitors get a random name like “Fierce Badger 73” and can upvote, downvote and comment.',
  },
  {
    icon: Timer,
    title: 'Run a poll on a timer',
    body: 'Open a poll, let it close itself, and the tallies are frozen into a result you can trust.',
  },
  {
    icon: MessageSquareText,
    title: 'Ship the verdict',
    body: 'Send results to Linear as an issue, or email them to yourself.',
  },
]

function Home() {
  return (
    <div className="grid gap-12 pt-6 sm:pt-12 lg:grid-cols-[1fr_360px] lg:gap-20">
      <section className="max-w-xl">
        <h1 className="text-[28px] leading-tight font-medium tracking-tight">Get your ideas slammed, honestly.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          A board for your ideas where feedback is anonymous, votes are tallied live, and a poll settles
          it. Only you need an account.
        </p>

        <ul className="mt-10 space-y-5">
          {STEPS.map((s) => (
            <li key={s.title} className="flex gap-3">
              <s.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <AuthLoading>
          <div className="space-y-4 rounded-lg border bg-card p-5">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </AuthLoading>
        <Unauthenticated>
          <CreatorSignIn />
        </Unauthenticated>
        <Authenticated>
          <SignedInPanel />
        </Authenticated>
      </section>
    </div>
  )
}

function SignedInPanel() {
  const me = useQuery(api.users.me)
  if (me === undefined) return <Skeleton className="h-32 w-full" />
  if (me === null) return <CreatorSignIn />
  if (me.role === 'creator') {
    return (
      <div className="space-y-4 rounded-lg border bg-card p-5">
        <div>
          <p className="text-[13px] text-muted-foreground">Signed in as</p>
          <p className="mt-0.5 font-medium">{me.displayName}</p>
        </div>
        <p className="text-[13px] text-muted-foreground">Your boards, polls and sessions are one click away.</p>
        <Button asChild size="sm" className="w-full">
          <Link to="/dashboard">
            Open dashboard <ArrowRight />
          </Link>
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-3 rounded-lg border bg-card p-5">
      <div>
        <p className="text-[13px] text-muted-foreground">Browsing anonymously as</p>
        <p className="mt-0.5 font-medium">{me.displayName}</p>
      </div>
      <p className="text-[13px] text-muted-foreground">
        That’s the name others see. Open a board link to start slamming, or sign out from the menu to sign
        in as a creator.
      </p>
    </div>
  )
}
