import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = (env.VITE_DEV_PROXY_TARGET || 'http://localhost:4000').replace(/\/$/, '')
  const toApi = { target: apiTarget, changeOrigin: true as const }

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true,
      strictPort: false,
      // When VITE_API_BASE_URL is empty in dev, axios hits same origin and these paths forward to the API.
      // Set VITE_DEV_PROXY_TARGET if the backend listens on a port other than 4000 (must match PORT in backend .env).
      proxy: {
        '/auth': toApi,
        '/public': toApi,
        '/patients': toApi,
        '/appointments': toApi,
        '/orders': toApi,
        '/pharmacy': toApi,
        '/notifications': toApi,
        '/super-admin': toApi,
        '/socket.io': { target: apiTarget, changeOrigin: true, ws: true },
      },
    },
  }
})
