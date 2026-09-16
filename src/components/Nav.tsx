import { Link } from '@tanstack/react-router'
import { useAuthActions, Authenticated } from '@convex-dev/auth/react'
import { useQuery } from 'convex/react'
import { useTheme } from 'next-themes'
import { LayoutGrid, LogOut, Moon, Sun, UserRound } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-1">
          <Authenticated>
            <UserMenu />
          </Authenticated>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" className={`text-sm font-semibold text-foreground ${className ?? ''}`}>
      Slam
    </Link>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Toggle theme"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Toggle theme</TooltipContent>
    </Tooltip>
  )
}

function UserMenu() {
  const me = useQuery(api.users.me)
  const { signOut } = useAuthActions()
  if (!me) return null
  const isCreator = me.role === 'creator'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 pr-2 pl-1.5 text-[13px] font-normal">
          <Avatar className="size-5">
            <AvatarFallback className="bg-secondary text-[9px] font-medium">{initials(me.displayName)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate sm:inline">{me.displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate font-medium">{me.displayName}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {isCreator ? 'Board creator' : 'Anonymous participant'}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isCreator ? (
          <DropdownMenuItem asChild>
            <Link to="/dashboard">
              <LayoutGrid /> Dashboard
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link to="/">
              <UserRound /> Sign in as a creator
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
