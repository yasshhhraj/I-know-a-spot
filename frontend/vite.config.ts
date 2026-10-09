import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages serves this repository under /I-know-a-spot/. Local and
  // custom-domain builds remain rooted at /.
  base: (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.GITHUB_ACTIONS ? '/I-know-a-spot/' : '/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // Temporary workaround: installed Rollup hangs optimizing the React graph.
      // Keep compilation/minification, but retain code rather than pruning it.
      // Re-enable only after the normal build succeeds with the chosen toolchain.
      treeshake: false,
    },
  },
  // server: {
  //   port: 5173,
  //   strictPort: true,
  // },
  server: {
  host: '127.0.0.1',
  port: 5173,
  strictPort: true,
  allowedHosts: ['2725-2409-40f4-100b-402-3279-61d4-1291-60f4.ngrok-free.app'],
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:3001',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
  },
},
})
