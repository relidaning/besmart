import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0', // Allow external access
    proxy: {
      '/api': {
        target: 'http://localhost:5071',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@client': path.resolve(__dirname, './src/client'),
      '@server': path.resolve(__dirname, './src/server'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@database': path.resolve(__dirname, './src/database'),
    },
  },
  build: {
    outDir: 'dist/client',
    sourcemap: true,
  },
})