import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // 大きなクエリ文字列で text を投入するため Node の HTTP ヘッダ上限を引き上げる。
    // vite dev root はリポジトリ root にしているため、 ready 判定は /demo/ で行う (root 直下に index.html を置かない構成)。
    command: 'node --max-http-header-size=131072 ./node_modules/vite/bin/vite.js',
    url: 'http://localhost:5173/demo/',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
});
