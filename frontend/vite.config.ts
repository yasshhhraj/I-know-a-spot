import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // Temporary workaround: installed Rollup hangs optimizing the React graph.
      // Keep compilation/minification, but retain code rather than pruning it.
      // Re-enable only after the normal build succeeds with the chosen toolchain.
      treeshake: false,
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
