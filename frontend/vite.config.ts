import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

const apiProxyTarget =
  process.env.VITE_DEV_API_PROXY_TARGET || 'http://127.0.0.1:4000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        changeOrigin: true,
        target: apiProxyTarget,
      },
    },
  },
  test: {
    allowOnly: false,
  },
})
