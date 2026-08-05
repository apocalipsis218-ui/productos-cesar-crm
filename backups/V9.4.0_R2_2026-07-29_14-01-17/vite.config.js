import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png'
      ],
      manifest: {
        id: '/',
        name: 'Productos César CRM',
        short_name: 'Productos César',
        description: 'CRM operativo de Productos César para órdenes, carnicería, facturación, validación, delivery y liquidación.',
        lang: 'es-DO',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#9f1239',
        orientation: 'any',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\//i,
            handler: 'NetworkOnly',
            method: 'GET',
            options: {
              cacheName: 'supabase-network-only'
            }
          },
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\//i,
            handler: 'NetworkOnly',
            method: 'POST',
            options: {
              cacheName: 'supabase-network-only'
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ]
});
