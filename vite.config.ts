import { defineConfig, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

const genStub: Plugin = {
  name: 'gen-stub',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'ssr-stub.js',
      source: `module.exports = {}`
    })
  }
}

export default defineConfig({
  plugins: [vue(), genStub, dts({
    entryRoot: __dirname,
    outputDir: ['dist'],
    insertTypesEntry: true
  })],
  build: {
    target: 'esnext',
    minify: false,
    lib: {
      entry: './src/index.ts',
      // formats: ['es'],
      fileName: 'vue-repl'
    },
    rollupOptions: {
      external: ['vue', 'vue/compiler-sfc']
    }
  }
})
