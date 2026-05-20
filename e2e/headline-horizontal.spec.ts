import { expect, test } from '@playwright/test';

// 共通の flaky 対策: fonts.ready + networkidle を待ち、 ResizeObserver の発火後 2 frame
// 相当の rAF を回してから assert する。 viewport 切り替え時にも同じ wait を適用する。
async function waitForReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()));
      }),
  );
}

test.describe('addHeadlineHorizontal (newspaper-horizontal scaffold)', () => {
  test.use({ viewport: { width: 1024, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/demo/newspaper-horizontal/');
    await page.waitForSelector('.tilepage-book');
    await waitForReady(page);
  });

  test('level 1-2 で <h1> / <h2> が生成され DOM 上に存在する', async ({ page }) => {
    const h1 = page.locator('h1.tilepage-headline[data-id="headline-main"]');
    const h2 = page.locator('h2.tilepage-headline[data-id="headline-sub"]');
    await expect(h1).toHaveCount(1);
    await expect(h2).toHaveCount(1);
    await expect(h1).toHaveText('走れメロス');
    await expect(h2).toHaveText('太宰治');
  });

  test('fitToBox: true 時、 element bbox が枠 inline-size 以下に収まる', async ({ page }) => {
    const h1 = page.locator('h1.tilepage-headline[data-id="headline-main"]');
    await expect(h1).toBeVisible();
    const fits = await h1.evaluate((el: HTMLElement) => {
      // scrollWidth (= 折り返しを無視した content の inline 必要量) が clientWidth (= 枠) を
      // 超えていないことで「収まっている」 と判定する。 subpixel rendering の丸めで 1px の
      // ぶれが乗る可能性を考慮し、 許容を +1px に取る。
      const tolerance = 1;
      return el.scrollWidth <= el.clientWidth + tolerance;
    });
    expect(fits).toBe(true);
  });

  test('resize 後に computed font-size が再計算される (狭くすると小さくなる)', async ({ page }) => {
    const h1 = page.locator('h1.tilepage-headline[data-id="headline-main"]');
    const before = await h1.evaluate(
      (el: HTMLElement) => Number.parseFloat(getComputedStyle(el).fontSize) || 0,
    );
    expect(before).toBeGreaterThan(0);

    // 元 viewport より十分狭くし、 ResizeObserver の発火 → 再計算 → CSS 反映を待つ。
    await page.setViewportSize({ width: 480, height: 800 });
    await waitForReady(page);
    // ResizeObserver は microtask に逃がしているため、 計測前にもう 1 段 rAF を回す。
    await page.evaluate(
      () =>
        new Promise<void>((r) => {
          requestAnimationFrame(() => requestAnimationFrame(() => r()));
        }),
    );

    const after = await h1.evaluate(
      (el: HTMLElement) => Number.parseFloat(getComputedStyle(el).fontSize) || 0,
    );
    // viewport を 1024 → 480 に縮めたので枠 inline-size も縮み、 fitToBox の収まる最大
    // font-size は単調に小さくなる。 厳密に before > after を assert する。
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });
});
