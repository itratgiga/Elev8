import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// "/" is the landing page; each of the other pages is its own entry that loads the same React app.
const pages = ['studio', 'products', 'tryon', 'kiosk', 'view360']

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: { main: 'index.html', ...Object.fromEntries(pages.map((p) => [p, `${p}/index.html`])) },
    },
  },
})
