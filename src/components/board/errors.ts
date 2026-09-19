import { ConvexError } from 'convex/values'

export function errorMessage(e: unknown): string {
  if (e instanceof ConvexError) {
    const data = e.data as { message?: string } | string
    if (typeof data === 'string') return data
    return data.message ?? 'Something went wrong'
  }
  return e instanceof Error ? e.message : 'Something went wrong'
}
