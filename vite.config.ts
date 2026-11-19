// File: vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Tambahkan plugin PWA agar aplikasi mendukung standard native
    VitePWA({
      registerType: 'autoUpdate',
      // MENAMBAHKAN WORKBOX UNTUK MENGATASI ERROR FILE SIZE DI VERCEL
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // Limit dinaikkan ke 5MB
      },
      manifest: {
        name: 'SekolahERP',
        short_name: 'SekolahERP',
        description: 'Sistem Informasi Manajemen Sekolah Terpadu',
        theme_color: '#059669', // Warna emerald-600
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  // KONFIGURASI BUILD VITE 8 (ROLLDOWN) UNTUK MEMECAH CHUNK JS AGAR RINGAN DI HP & WEB
  build: {
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
            },
            {
              name: 'vendor-supabase',
              test: /node_modules[\\/]@supabase[\\/]/,
            },
            {
              name: 'vendor-ui',
              test: /node_modules[\\/](framer-motion|lucide-react|@radix-ui|clsx|tailwind-merge)[\\/]/,
            },
            {
              name: 'vendor-maps-charts',
              test: /node_modules[\\/](leaflet|react-leaflet|recharts|d3-.*)[\\/]/,
            },
            {
              name: 'vendor-forms',
              test: /node_modules[\\/](react-hook-form|@hookform|zod)[\\/]/,
            },
            {
              name: 'vendor-common',
              test: /node_modules[\\/]/,
            },
          ],
        },
      },
    },
  },
})