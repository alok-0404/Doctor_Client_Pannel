import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    strictPort: false,
    // When VITE_API_BASE_URL is empty in dev, axios hits same origin and these paths forward to the API.
    proxy: {
      '/auth': { target: 'http://localhost:4000', changeOrigin: true },
      '/public': { target: 'http://localhost:4000', changeOrigin: true },
      '/patients': { target: 'http://localhost:4000', changeOrigin: true },
      '/appointments': { target: 'http://localhost:4000', changeOrigin: true },
      '/orders': { target: 'http://localhost:4000', changeOrigin: true },
      '/pharmacy': { target: 'http://localhost:4000', changeOrigin: true },
      '/notifications': { target: 'http://localhost:4000', changeOrigin: true },
      '/super-admin': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})
