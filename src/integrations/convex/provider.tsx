import { ConvexAuthProvider } from '@convex-dev/auth/react'
import type { ConvexReactClient } from 'convex/react'
import { api } from '../../../convex/_generated/api'

/**
 * Convex Auth v2 in SPA mode: tokens live in localStorage in the browser and
 * in memory during SSR, so public queries render on the server and
 * user-specific state fills in on the client.
 */
export default function AppConvexProvider({
  client,
  children,
}: {
  client: ConvexReactClient
  children: React.ReactNode
}) {
  return (
    <ConvexAuthProvider
      client={client}
      api={{
        refreshSession: api.auth.refreshSession,
        signOut: api.auth.signOut,
      }}
    >
      {children}
    </ConvexAuthProvider>
  )
}
