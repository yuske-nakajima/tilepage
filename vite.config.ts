import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf-8'));

// dev server (serve) はリポジトリ全体を root として serve する。
// demo/ 配下は showcase、 e2e/fixtures/ 配下は E2E 駆動用 fixture という役割分担を維持しつつ、
// 1 つの vite server で `/demo/...` と `/e2e/fixtures/...` の両方にアクセスできる。
// publicDir は `demo/public/` を明示指定し、 画像 (meros-*.png) は dev / build 両方で `/meros-*.png` で参照可能にする。
export default defineConfig(({ command }) => ({
  root: command === 'serve' ? import.meta.dirname : undefined,
  publicDir: command === 'serve' ? resolve(import.meta.dirname, 'demo/public') : undefined,
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    minify: 'terser',
    rollupOptions: {
      output: { exports: 'named' },
    },
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'TilePage',
      formats: ['es', 'umd'],
      fileName: (format) => {
        if (format === 'es') return 'tilepage.js';
        if (format === 'umd') return 'tilepage.umd.cjs';
        return `tilepage.${format}.js`;
      },
    },
  },
}));
