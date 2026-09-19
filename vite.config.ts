import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Devtools are optional so CI / production installs that omit some
 * devDependencies can still load vite.config.ts.
 */
async function optionalDevtools() {
  try {
    const { devtools } = await import('@tanstack/devtools-vite')
    return [devtools()]
  } catch {
    return []
  }
}

export default defineConfig(async () => ({
  resolve: { tsconfigPaths: true },
  server: { host: '127.0.0.1' },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    ...(await optionalDevtools()),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
}))
