import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Semua tes jalan lawan satu project Supabase asli yang sama (bukan
    // database per-test yang terisolasi), jadi file tes HARUS berurutan —
    // paralel bisa bikin dua tes berebut lokasi/varian yang sama dan
    // saling ganggu saldonya.
    fileParallelism: false,
  },
})
