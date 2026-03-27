import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.js',
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/gigi-api': {
        target: 'http://localhost:3142',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gigi-api/, ''),
      },
    },
  },
})
