const SITE_NAME = 'Slam'
const DEFAULT_DESCRIPTION = 'Post ideas. Get them slammed, anonymously.'
const DEFAULT_ORIGIN = 'http://127.0.0.1:3000'
// The custom domain in wrangler.jsonc. Deploys build locally, so a dev VITE_SITE_URL would otherwise end up in production.
const PRODUCTION_ORIGIN = 'https://slam.428.lol'
const OG_IMAGE = '/og.png'

export type SeoInput = {
  title?: string
  description?: string
  path?: string
  image?: string
  noIndex?: boolean
}

function siteOrigin() {
  if (import.meta.env.PROD) return PRODUCTION_ORIGIN
  const fromEnv = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined') return window.location.origin
  return DEFAULT_ORIGIN
}

function abs(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${siteOrigin()}${path.startsWith('/') ? path : `/${path}`}`
}

function pageTitle(title?: string) {
  if (!title || title === SITE_NAME) return SITE_NAME
  return title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`
}

/** Document title, Open Graph, Twitter, and canonical URL for a route. */
export function seo({
  title,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  image = OG_IMAGE,
  noIndex = false,
}: SeoInput = {}) {
  const fullTitle = pageTitle(title)
  const url = abs(path)
  const imageUrl = abs(image)

  return {
    meta: [
      { title: fullTitle },
      { name: 'description', content: description },
      { name: 'application-name', content: SITE_NAME },
      { name: 'apple-mobile-web-app-title', content: SITE_NAME },
      { name: 'robots', content: noIndex ? 'noindex, nofollow' : 'index, follow' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:locale', content: 'en_US' },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: fullTitle },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: imageUrl },
      { property: 'og:image:type', content: 'image/png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: fullTitle },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: fullTitle },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: imageUrl },
      { name: 'twitter:image:alt', content: fullTitle },
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}
