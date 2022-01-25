import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  clean: true,
  dts: true,
  format: ['cjs', 'esm', 'iife'],
  globalName: 'leanCloud'
  // minify: true
})