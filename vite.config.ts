// File: vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa' // Tambahkan import ini

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    // Tambahkan plugin PWA agar aplikasi mendukung standard native
    VitePWA({
      registerType: 'autoUpdate',
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
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
})