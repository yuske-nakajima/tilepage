import { expect, test } from '@playwright/test';
import { visibleTextOf } from './helpers/visibleText';

// root demo (demo/main.ts) は 6 段組み book に 3 page (rect / circle / polygon obstacle) を配置し、
// 1 本の連続ストリームを page 1 -> 2 -> 3 に流す構成。各 page への duplicate は禁止 (評価軸 #2)。
const SOURCE_TEXT =
  '本文がこの障害物を避けて 6 段組みに流れる。矩形・円・任意多角形の 3 形状に対応し、' +
  'clip-path で見た目を整形しつつ、shape-outside で同じ形のテキスト回避を実現する。' +
  '矩形と段の交差は Sutherland-Hodgman 多角形クリッピングで計算され、' +
  '各段に注入される不可視 float の shape-outside polygon としてレンダリングされる。' +
  'ResizeObserver でブラウザ幅変更時のリフローにも追従する。' +
  'A book is pages. A page is a viewport. Place rectangles. Pour text. ' +
  'これが TilePage のメンタルモデルである。';

test.describe('TilePage demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.tilepage-book');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('book と 3 page が表示される', async ({ page }) => {
    await expect(page.locator('.tilepage-book')).toBeVisible();
    await expect(page.locator('.tilepage-page')).toHaveCount(3);
  });

  test('各 page に 6 個の column が存在する (合計 18)', async ({ page }) => {
    await expect(page.locator('.tilepage-column')).toHaveCount(18);
  });

  test('3 つの obstacle (rect / circle / polygon) が配置されている', async ({ page }) => {
    await expect(page.locator('.tilepage-obstacle')).toHaveCount(3);
  });

  test('矩形と交差する段に float が注入されている', async ({ page }) => {
    const count = await page.locator('.tilepage-obstacle-float').count();
    // 3 obstacle 各々が複数段に跨るので、最低でも 3 個以上
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('circle / polygon の obstacle に clip-path が同期される', async ({ page }) => {
    const obstacles = page.locator('.tilepage-obstacle');
    await expect(obstacles).toHaveCount(3);
    const first = await obstacles.nth(0).evaluate((el) => el.style.clipPath);
    expect(first).toBe('');
    const second = await obstacles.nth(1).evaluate((el) => el.style.clipPath);
    const third = await obstacles.nth(2).evaluate((el) => el.style.clipPath);
    expect(second).toContain('polygon(');
    expect(third).toContain('polygon(');
  });

  test('book 全体の visible text が source と厳密一致 (duplicate なし)', async ({ page }) => {
    // root demo で V === SOURCE が成立することで、page 単位 duplicate がゼロであることを示す。
    const { text: V } = await visibleTextOf(page, { rootSelector: '.tilepage-book' });
    expect(V).toBe(SOURCE_TEXT);
    expect(V.length).toBe(SOURCE_TEXT.length);
  });
});
