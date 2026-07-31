import { defineConfig, devices } from '@playwright/test';

const E2E_PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/_*.spec.ts', '**/inspect-*.spec.ts', '**/sprint*-evaluator*.spec.ts'],
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    screenshot: 'only-on-failure',
  },
  webServer: {
    // 大きなクエリ文字列で text を投入するため Node の HTTP ヘッダ上限を引き上げる。
    // vite dev root はリポジトリ root にしているため、 ready 判定は /demo/ で行う (root 直下に index.html を置かない構成)。
    command: `node --max-http-header-size=131072 ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${E2E_PORT} --strictPort`,
    url: `http://127.0.0.1:${E2E_PORT}/demo/`,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
});
