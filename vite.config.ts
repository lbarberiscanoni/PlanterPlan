import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@test': path.resolve(__dirname, './Testing/test-utils'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './Testing/setupTests.ts',
    include: ['Testing/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: [
        'src/shared/lib/**',
        'src/shared/api/**',
        'src/features/**/lib/**',
        'src/features/**/hooks/**',
      ],
    },
  },
  build: {
    outDir: 'build',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('@supabase/supabase-js') || id.includes('node_modules/date-fns/')) return 'vendor';
          if (id.includes('node_modules/recharts/')) return 'charts';
          if (id.includes('node_modules/framer-motion/')) return 'motion';
          return undefined;
        },
      },
    },
  },
})
