import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/OBBBA_network_explorer/',
  plugins: [react()],
})

