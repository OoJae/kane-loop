import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const env = (key: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key]

export default defineConfig({
  // The console moved to /console once the landing site took over `/`. Both
  // builds emit /assets, so only a base keeps them apart. Unset (local dev,
  // `./scripts/dev.sh`) this stays '/' and nothing changes.
  base: env('KANE_BASE') ?? '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 4321,
    strictPort: true,
  },
})
