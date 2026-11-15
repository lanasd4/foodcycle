import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'brand/*.svg'],
      manifest: {
        name: 'FoodCycle — كل وجبة تستحق فرصة ثانية',
        short_name: 'FoodCycle',
        description: 'منصة تربط المطاعم والمخابز بالجمعيات لإنقاذ الطعام الفائض',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        display: 'standalone',
        background_color: '#fbfbf9',
        theme_color: '#0B7F4A',
        icons: [
          { src: '/brand/logo-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/brand/logo-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // the app shell works offline; API calls always go to the network
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // same origin in development: no CORS, cookies and sockets just work
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
})
