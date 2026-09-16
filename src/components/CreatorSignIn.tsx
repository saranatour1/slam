import { useState } from 'react'
import {
  useSignInWithPassword,
  useSignUpWithPassword,
} from '@convex-dev/auth/providers/password/react'
import { MIN_PASSWORD_LENGTH } from '@convex-dev/auth/providers/password/validation'
import { AlertCircle, Loader2 } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { cn } from '#/lib/utils'

type Mode = 'signIn' | 'signUp'

export function CreatorSignIn({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>('signIn')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { signIn, pending: signingIn } = useSignInWithPassword(api.auth.signInWithPassword)
  const { signUp, pending: signingUp } = useSignUpWithPassword(api.auth.signUpWithPassword)
  const pending = signingIn || signingUp

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const result =
      mode === 'signIn' ? await signIn({ username, password }) : await signUp({ username, password })
    if (!result.success) setError(describe(result.userError))
  }

  return (
    <div className={cn('rounded-lg border bg-card p-5', compact ? 'w-full max-w-sm' : 'w-full')}>
      <div className="space-y-1">
        <h2 className="text-base font-medium">{mode === 'signIn' ? 'Sign in' : 'Create your account'}</h2>
        <p className="text-[13px] text-muted-foreground">
          Only the board creator needs an account. Everyone else joins anonymously.
        </p>
      </div>
      <Tabs
        value={mode}
        onValueChange={(v) => {
          setMode(v as Mode)
          setError(null)
        }}
        className="mt-4"
      >
        <TabsList variant="line" className="w-full justify-start border-b pb-1">
          <TabsTrigger value="signIn" className="flex-none px-1 text-[13px]">
            Sign in
          </TabsTrigger>
          <TabsTrigger value="signUp" className="flex-none px-1 text-[13px]">
            Sign up
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="username" className="text-[13px]">
            Username
          </Label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            placeholder="e.g. sara"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={pending}
            className="h-8"
          />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password" className="text-[13px]">
              Password
            </Label>
            {mode === 'signUp' ? (
              <span className="text-xs text-muted-foreground">{MIN_PASSWORD_LENGTH}+ characters</span>
            ) : null}
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            minLength={mode === 'signUp' ? MIN_PASSWORD_LENGTH : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={pending}
            className="h-8"
          />
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" size="sm" disabled={pending} className="mt-1">
          {pending ? <Loader2 className="animate-spin" /> : null}
          {mode === 'signIn' ? 'Sign in' : 'Create account'}
        </Button>
      </form>
    </div>
  )
}

function describe(userError: { error: string } & Record<string, unknown>): string {
  switch (userError.error) {
    case 'USER_NOT_FOUND':
      return 'No account exists with that username.'
    case 'INVALID_CREDENTIALS':
      return 'Incorrect username or password.'
    case 'USERNAME_TAKEN':
      return 'That username is already taken.'
    case 'USERNAME_TOO_SHORT':
      return `Username must be at least ${String(userError.minimumLength)} characters.`
    case 'USERNAME_HAS_SURROUNDING_WHITESPACE':
    case 'PASSWORD_HAS_SURROUNDING_WHITESPACE':
      return "Values can't start or end with whitespace."
    case 'USERNAME_HAS_INVALID_CHARACTERS':
      return 'Username contains characters that are not allowed.'
    case 'PASSWORD_TOO_SHORT':
      return `Password must be at least ${String(userError.minimumLength)} characters.`
    case 'PASSWORD_TOO_LONG':
      return `Password must be at most ${String(userError.maximumLength)} characters.`
    case 'PASSWORD_TOO_COMMON':
      return 'That password is too common. Pick another.'
    case 'RATE_LIMITED':
      return `Too many attempts. Try again in ${Math.ceil(Number(userError.retryAfterMs) / 1000)}s.`
    default:
      console.error('Auth failed:', userError)
      return 'Something went wrong. Please try again.'
  }
}
