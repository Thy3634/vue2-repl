import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/vue2-repl/',
  plugins: [vue()],
  build: {
    target: 'esnext',
    outDir: 'docs',
    rollupOptions: {
      external: ['vue', 'vue/compiler-sfc']
    }
  }
})
