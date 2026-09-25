import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves this from a /db-dungeon-buddy/ subpath; Vercel (and
// local dev) serve it from the domain root. GITHUB_PAGES is set only by
// .github/workflows/deploy.yml's build step.
const base = process.env.GITHUB_PAGES ? '/db-dungeon-buddy/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Only the app shell (HTML/JS/CSS/fonts/icons) is precached here.
      // Campaign data always goes through the network — see BIBLE.md §6,
      // caching that would risk serving stale campaign content.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
      },
      manifest: {
        name: 'Dungeon Buddy — D&D Campaign Companion',
        short_name: 'Dungeon Buddy',
        description: 'A companion app for running and playing a full D&D campaign.',
        theme_color: '#1c1411',
        background_color: '#1c1411',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
})
