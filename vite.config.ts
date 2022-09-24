import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'esnext',
    minify: false,
    lib: {
      entry: './src/index.ts',
      // formats: ['es'],
      fileName: 'vue2-repl',
      name: 'Vue2Repl'
    },
    rollupOptions: {
      external: ['vue', 'vue/compiler-sfc']
    }
  }
})
