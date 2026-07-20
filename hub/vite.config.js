import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// DigiWP hub — a client-side React SPA. The backend is *your server*
// (see src/lib/api.js); this app never touches a managed WordPress site
// directly — every action is proxied through your server + the connector.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
})
