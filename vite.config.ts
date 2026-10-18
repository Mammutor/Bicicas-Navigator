import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function maplibreWorker(): Plugin {
  return {
    name: 'maplibre-worker',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'assets/maplibre-gl-worker.mjs',
        source: readFileSync('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', 'utf8'),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), maplibreWorker()],
  base: './',
  server: {
    host: true,
  },
  // MapLibre loads its parser from a sibling worker file. Prebundling breaks that URL.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
