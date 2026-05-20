import { expect, test } from '@playwright/test';

// 新聞風統合 showcase の E2E。 同一 page に Headline (h1 + h3) / Pullquote / Box /
// 画像 Obstacle / paragraph スタイル付き Flow が共存していることを DOM レベルで verify する。
//
// viewport は既存 spec と同じ Pixel 7 + デスクトップ Chrome の 2 project で実行され、
// 本 spec は viewport を 1024x800 に固定して N=4 (60em..120em 区間) を決め打ちする。

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

test.describe('newspaper-horizontal showcase (Headline + Pullquote + Box + Obstacle + paragraph)', () => {
  test.use({ viewport: { width: 1024, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/demo/newspaper-horizontal/');
    await page.waitForSelector('.tilepage-book');
    await waitForReady(page);
  });

  test('主要 DOM 要素 (h1 / h3 / blockquote / .tilepage-box) が揃って存在する', async ({
    page,
  }) => {
    // criteria 要件: h1 (level=1) と h3 (level=3) の両方が生成されていること。
    // h2 (headline-sub) は scaffold 期から残る著者見出しで、 本 spec の必須対象ではない。
    const h1 = page.locator('h1.tilepage-headline[data-id="headline-main"]');
    const h3 = page.locator('h3.tilepage-headline[data-id="headline-section"]');
    const pq = page.locator('blockquote.tilepage-pullquote[data-id="pullquote-main"]');
    const box = page.locator('.tilepage-box[data-id="box-note"]');

    await expect(h1).toHaveCount(1);
    await expect(h3).toHaveCount(1);
    await expect(pq).toHaveCount(1);
    await expect(box).toHaveCount(1);
  });

  test('各要素の visible text が空文字でない (見出し / 引用 / 注釈 / 本文)', async ({ page }) => {
    const h1Text = await page
      .locator('h1.tilepage-headline[data-id="headline-main"]')
      .textContent();
    const h3Text = await page
      .locator('h3.tilepage-headline[data-id="headline-section"]')
      .textContent();
    const pqText = await page
      .locator('blockquote.tilepage-pullquote[data-id="pullquote-main"] .tilepage-pullquote-text')
      .textContent();
    const boxText = await page.locator('.tilepage-box[data-id="box-note"]').textContent();
    const flowText = await page.locator('.tilepage-flow-text').first().textContent();

    expect(h1Text?.trim()).toBe('走れメロス');
    expect((h3Text ?? '').trim().length).toBeGreaterThan(0);
    expect((pqText ?? '').trim().length).toBeGreaterThan(0);
    expect((boxText ?? '').trim().length).toBeGreaterThan(0);
    expect((flowText ?? '').trim().length).toBeGreaterThan(0);
  });

  test('画像 obstacle (img) が DOM 上に存在し src が解決されている', async ({ page }) => {
    // src を渡した obstacle は <img> 自身に data-id が付く (wrapper を介さない)。
    const img = page.locator('img.tilepage-obstacle[data-id="image-king"]');
    await expect(img).toHaveCount(1);
    const src = await img.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src ?? '').toMatch(/meros-1-king\.png$/);
  });

  test('addFlow paragraph オプションが .tilepage-flow-text に data 属性で反映される', async ({
    page,
  }) => {
    const holder = page.locator('.tilepage-flow-text').first();
    await expect(holder).toBeVisible();
    const attrs = await holder.evaluate((el: HTMLElement) => {
      const cs = getComputedStyle(el);
      return {
        indent: el.getAttribute('data-paragraph-indent'),
        justify: el.getAttribute('data-paragraph-justify'),
        kinsoku: el.getAttribute('data-paragraph-kinsoku'),
        hanging: el.getAttribute('data-paragraph-hanging-punctuation'),
        textAlign: cs.textAlign,
        lineBreak: cs.lineBreak,
        wordBreak: cs.wordBreak,
      };
    });
    expect(attrs.indent).toBe('1em');
    expect(attrs.justify).toBe('true');
    expect(attrs.kinsoku).toBe('strict');
    expect(attrs.hanging).toBe('true');
    expect(attrs.textAlign).toBe('justify');
    expect(attrs.lineBreak).toBe('strict');
    expect(attrs.wordBreak).toBe('keep-all');
  });

  test('画像 obstacle が非ゼロサイズで配置され、 .tilepage-book 内に収まっている', async ({
    page,
  }) => {
    // reflow が成立している最低保証: img obstacle が grid セルに割り付けられて
    // 非ゼロの bbox を持ち、 親 .tilepage-book の bbox 内に収まっていること。
    const imgRect = await page.locator('img.tilepage-obstacle[data-id="image-king"]').boundingBox();
    expect(imgRect).not.toBeNull();
    if (!imgRect) return;
    expect(imgRect.width).toBeGreaterThan(0);
    expect(imgRect.height).toBeGreaterThan(0);

    const bookRect = await page.locator('.tilepage-book').first().boundingBox();
    expect(bookRect).not.toBeNull();
    if (!bookRect) return;
    // 画像 bbox が book 矩形に含まれていること (= reflow が page 内に obstacle を配置できた)。
    expect(imgRect.x).toBeGreaterThanOrEqual(bookRect.x - 1);
    expect(imgRect.y).toBeGreaterThanOrEqual(bookRect.y - 1);
    expect(imgRect.x + imgRect.width).toBeLessThanOrEqual(bookRect.x + bookRect.width + 1);
  });
});
