import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { ConvexQueryClient } from '@convex-dev/react-query'
import { ThemeProvider } from 'next-themes'

import { Nav } from '#/components/Nav'
import { Button } from '#/components/ui/button'
import { Toaster } from '#/components/ui/sonner'
import { TooltipProvider } from '#/components/ui/tooltip'
import { seo } from '#/lib/seo'
import appCss from '../styles.css?url'

interface MyRouterContext {
  queryClient: QueryClient
  convexQueryClient: ConvexQueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => {
    const tags = seo({ path: '/' })
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#fafafa', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#0f1011', media: '(prefers-color-scheme: dark)' },
        ...tags.meta,
      ],
      scripts: [
        {
          src: 'https://cdn.databuddy.cc/databuddy.v7.js',
          'data-client-id': 'ef3271d1-7a51-4c0b-b8be-782bcbf3c183',
          'data-track-web-vitals': 'true',
          integrity: 'sha384-IfiAF4qW6NyO33JcH5PQNvsQwKPPp9aobhAJAxWSwOm23K0L7Xr/oZAUjD9NFCTJ',
          crossOrigin: 'anonymous',
          async: true,
        },
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/favicon.svg' },
        ...tags.links,
      ],
    }
  },
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={200}>
        <div className="relative flex min-h-dvh flex-col">
          <Nav />
          <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-8 pb-16 sm:px-8">
            <Outlet />
          </main>
          <footer className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pb-6 text-xs text-muted-foreground sm:px-8">
            <span>Slam · ideas, judged anonymously</span>
            <span>convex · tanstack</span>
          </footer>
        </div>
        <Toaster position="bottom-right" closeButton />
      </TooltipProvider>
    </ThemeProvider>
  )
}

function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="text-xs text-muted-foreground">404</p>
      <h1 className="mt-2 text-xl font-medium">Nothing to slam here.</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">That page doesn’t exist, or the board link is wrong.</p>
      <Button asChild size="sm" variant="outline" className="mt-6">
        <Link to="/">Back home</Link>
      </Button>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
