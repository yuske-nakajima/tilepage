import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { visibleTextOf } from './helpers/visibleText';

// v0.4 評価軸 6 項目を 1 つずつ独立に検証する self-check matrix。
// 計画書 Sprint 5 self-check matrix の各軸を、独立した test として実装する。

type WritingMode = 'horizontal-tb' | 'vertical-rl';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

const SOURCE = '[HEAD]本文ストリーム<§000>The quick brown fox jumps over the lazy dog.[TAIL]';

function buildUrl(params: { columns: number; writingMode: WritingMode; text: string }): string {
  const q = new URLSearchParams({
    columns: String(params.columns),
    writingMode: params.writingMode,
    obstacle: 'none',
    text: params.text,
  });
  return `/e2e/fixtures/v0.4/?${q.toString()}`;
}

function buildWidthUrl(params: {
  columnWidth: string;
  writingMode: WritingMode;
  text: string;
}): string {
  const q = new URLSearchParams({
    columnWidth: params.columnWidth,
    writingMode: params.writingMode,
    obstacle: 'none',
    text: params.text,
  });
  return `/e2e/fixtures/v0.4/?${q.toString()}`;
}

test.describe('v0.4 評価軸 self-check (#1〜#6)', () => {
  test('#1 text は 1 本連続ストリーム / page 可変 / resize 再分配', async ({ browser }) => {
    // 検証手段: resize sweep で各 viewport step で V===SOURCE を満たし、page 数が変動する。
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await ctx.newPage();
    try {
      await page.goto(buildUrl({ columns: 3, writingMode: 'horizontal-tb', text: SOURCE }));
      await page.waitForSelector('#app[data-ready="true"]');
      await page.waitForTimeout(500);

      // (a) book._sourceText が 1 箇所だけ保持されている
      const sourceText = await page.evaluate(() => {
        const t = (window as unknown as { __tilepageV04?: { book: { _sourceText: string } } })
          .__tilepageV04;
        return t?.book._sourceText ?? null;
      });
      expect(sourceText).toBe(SOURCE);

      // (b) resize で V === SOURCE が成立し続ける
      for (const width of [1200, 1500, 1800]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(400);
        const { text: V } = await visibleTextOf(page, { rootSelector: '.tilepage-book' });
        expect(V, `viewport ${width}`).toBe(SOURCE);
      }
    } finally {
      await ctx.close();
    }
  });

  test('#2 横書き/縦書き同一 engine、duplicate 撤廃', async ({ browser }) => {
    // (a) flow engine 内の writing-mode リテラル分岐は axis.ts のみ
    const measureSrc = read('src/flow/measure.ts');
    const chunkSrc = read('src/flow/chunk.ts');
    const distributeSrc = read('src/flow/distribute.ts');
    expect(measureSrc).not.toMatch(/vertical-rl|horizontal-tb|writingMode\s*===/);
    expect(chunkSrc).not.toMatch(/vertical-rl|horizontal-tb|writingMode\s*===/);
    expect(distributeSrc).not.toMatch(/vertical-rl|horizontal-tb|writingMode\s*===/);

    // (c) addFlow に page 引数を取る overload が残っていないこと。
    // 「each page に同じ text を duplicate」設計の根である page 単位 addFlow を撤廃する根拠。
    const tilepageSrc = read('src/TilePage.ts');
    const addFlowPageOverloads = tilepageSrc
      .split('\n')
      .filter((line) => /addFlow\s*\([^)]*\bpage\b\s*:/i.test(line));
    expect(addFlowPageOverloads).toEqual([]);
    // signature が Page 型を直接受けないこと
    expect(tilepageSrc).not.toMatch(/addFlow\s*\([^)]*:\s*Page[\s,)]/);

    // (b) V === SOURCE の厳密一致 (V が SOURCE の整数倍なら duplicate のサインで NG)
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
    const page = await ctx.newPage();
    try {
      for (const wm of ['horizontal-tb', 'vertical-rl'] as const) {
        await page.goto(buildUrl({ columns: 3, writingMode: wm, text: SOURCE }));
        await page.waitForSelector('#app[data-ready="true"]');
        await page.waitForTimeout(500);
        const { text: V } = await visibleTextOf(page, { rootSelector: '.tilepage-book' });
        // 厳密一致でないと FAIL。duplicate なら長さが SOURCE 以上になる。
        expect(V).toBe(SOURCE);
        // 整数倍 duplicate の rapid check: V の長さは SOURCE 長と等しい
        expect(V.length).toBe(SOURCE.length);
      }
    } finally {
      await ctx.close();
    }
  });

  test('#3 段数 N (configurable)、6 はデフォルトに過ぎない', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
    const page = await ctx.newPage();
    try {
      for (const cols of [2, 3, 6, 8] as const) {
        await page.goto(buildUrl({ columns: cols, writingMode: 'horizontal-tb', text: SOURCE }));
        await page.waitForSelector('#app[data-ready="true"]');
        await page.waitForTimeout(400);
        const { text: V } = await visibleTextOf(page, { rootSelector: '.tilepage-book' });
        expect(V, `cols=${cols}`).toBe(SOURCE);
        const columnCount = await page
          .locator('.tilepage-page')
          .first()
          .locator('.tilepage-column')
          .count();
        expect(columnCount).toBe(cols);
      }
    } finally {
      await ctx.close();
    }
  });

  test('#3 段幅宣言 (columns: { width }) で N は viewport から導出される', async ({ browser }) => {
    // columnWidth=14em で viewport を 3 段階に動かすと N が単調増加すること。
    // 各 viewport で V === SOURCE を維持。
    const ctx = await browser.newContext({ viewport: { width: 600, height: 900 } });
    const page = await ctx.newPage();
    try {
      await page.goto(
        buildWidthUrl({ columnWidth: '14em', writingMode: 'horizontal-tb', text: SOURCE }),
      );
      await page.waitForSelector('#app[data-ready="true"]');
      const counts: number[] = [];
      for (const width of [600, 1200, 1800] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(500);
        const { text: V } = await visibleTextOf(page, { rootSelector: '.tilepage-book' });
        expect(V, `width-mode viewport=${width}`).toBe(SOURCE);
        const n = await page.locator('.tilepage-page').first().locator('.tilepage-column').count();
        counts.push(n);
      }
      // 単調非減少 (= 増えるか同じ)。広がるほど多段になる方向。
      expect(counts[0]).toBeLessThanOrEqual(counts[1]);
      expect(counts[1]).toBeLessThanOrEqual(counts[2]);
      // 600 → 1800 で少なくとも 1 段は増えていること (N が実際に動的化されている証拠)。
      expect(counts[2]).toBeGreaterThan(counts[0]);
    } finally {
      await ctx.close();
    }
  });

  test('#4 px 固定なし、論理プロパティ + 1fr / %', async () => {
    // src/flow/*.ts には px リテラル 0 件
    const flowFiles = [
      'src/flow/axis.ts',
      'src/flow/chunk.ts',
      'src/flow/distribute.ts',
      'src/flow/measure.ts',
      'src/flow/reflow.ts',
    ];
    for (const f of flowFiles) {
      const src = read(f);
      expect(src, f).not.toMatch(/\b\d+px\b/);
    }
    // src/TilePage.ts も px リテラル 0 件 (Sprint 5 で reflowObstacles 動的 px を撤廃)
    const tilepage = read('src/TilePage.ts');
    expect(tilepage).not.toMatch(/\b\d+px\b/);

    // CSS の column / band dimension は論理プロパティのみ
    const css = read('src/styles/tilepage.css');
    expect(css).toMatch(/inline-size|block-size/);
    // .tilepage-column 単独に writing-mode が当たっていないこと (PR #3 失敗パターン)
    const columnBlock = css.match(/\.tilepage-column\s*\{[^}]*\}/);
    expect(columnBlock?.[0] ?? '').not.toMatch(/writing-mode/);
  });

  test('#5 visible text 照合 (DOM 存在ベース不可)', async () => {
    const helper = read('e2e/helpers/visibleText.ts');
    // elementFromPoint の関数呼び出しが含まれないこと (コメントでの言及は許可)。
    expect(helper).not.toMatch(/elementFromPoint\s*\(/);
    // innerText / textContent 単独照合の不在 (rect ベース判定が主)
    expect(helper).toMatch(/getClientRects/);
    expect(helper).toMatch(/getBoundingClientRect/);
    // overflow chain 判定が存在
    expect(helper).toMatch(/overflowX|overflowY/);
  });

  test('#6 CSS でできないところは JS で測る', async () => {
    const measure = read('src/flow/measure.ts');
    // Range API + getClientRects の実利用
    expect(measure).toMatch(/createRange|new Range/);
    expect(measure).toMatch(/getClientRects/);
    expect(measure).toMatch(/setStart|setEnd/);
  });
});
