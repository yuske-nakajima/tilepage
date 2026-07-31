import { expect, test } from '@playwright/test';
import { visibleTextOf } from './helpers/visibleText';
import { waitForTilePageReady } from './helpers/waitForTilePageReady';

type WritingMode = 'horizontal-tb' | 'vertical-rl';
type ObstacleKind = 'none' | 'rect' | 'circle' | 'polygon';

// SOURCE は v0.4 demo に投入する 1 本のストリーム。
// duplicate を検出するため、以下を含む:
// - 先頭マーカー [HEAD]
// - 末尾マーカー [TAIL]
// - 重複しやすい部分文字列 (繰り返しトークン) を入れない (= 整数倍 duplicate を検出可能にする)
// - 日本語 + 英数字 mix
// - 数千字オーダー
function buildSource(): string {
  const head = '[HEAD]';
  const tail = '[TAIL]';
  const para =
    '本文の一段落。横書きでも縦書きでも 1 本の連続ストリームとして流れ、' +
    '段の終端で次の段の頭へ折り返し、ページ末尾でページを跨ぐ。' +
    'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.';
  // 一意な index を埋め込んで duplicate を文字列レベルで検出できるようにする
  const parts: string[] = [head];
  for (let i = 0; i < 24; i++) {
    parts.push(`<§${i.toString().padStart(3, '0')}>${para}`);
  }
  parts.push(tail);
  return parts.join('');
}

const SOURCE = buildSource();

const VIEWPORTS: ReadonlyArray<{ width: number; height: number }> = [
  { width: 1200, height: 900 },
  { width: 1500, height: 900 },
  { width: 1800, height: 1000 },
];

const WRITING_MODES: ReadonlyArray<WritingMode> = ['horizontal-tb', 'vertical-rl'];

const COLUMNS: ReadonlyArray<number> = [2, 3, 6, 8];

const OBSTACLES: ReadonlyArray<ObstacleKind> = ['none', 'rect', 'circle', 'polygon'];

function buildUrl(params: {
  columns: number;
  writingMode: WritingMode;
  obstacle: ObstacleKind;
  text: string;
}): string {
  const q = new URLSearchParams({
    columns: String(params.columns),
    writingMode: params.writingMode,
    obstacle: params.obstacle,
    text: params.text,
  });
  return `/e2e/fixtures/v0.4/?${q.toString()}`;
}

test.describe('v0.4 flow-engine matrix (V === S)', () => {
  for (const viewport of VIEWPORTS) {
    for (const writingMode of WRITING_MODES) {
      for (const columns of COLUMNS) {
        for (const obstacle of OBSTACLES) {
          const title = `vw=${viewport.width} wm=${writingMode} cols=${columns} obstacle=${obstacle}`;
          test(title, async ({ browser }) => {
            const ctx = await browser.newContext({ viewport });
            const page = await ctx.newPage();
            try {
              await page.goto(buildUrl({ columns, writingMode, obstacle, text: SOURCE }));
              await page.waitForSelector('#app[data-ready="true"]');
              await waitForTilePageReady(page);

              const { text: V } = await visibleTextOf(page, { rootSelector: '.tilepage-book' });

              // V === SOURCE を assert (文字列完全一致)。
              // duplicate なら V が SOURCE の整数倍に近い文字列になり不一致、
              // overflow:hidden で読めない場合は V が SOURCE より短くなり不一致、
              // どちらも検出する。
              expect(V).toBe(SOURCE);
            } finally {
              await ctx.close();
            }
          });
        }
      }
    }
  }
});

// 段幅宣言 (auto-fit width) モードの検証。
// width × viewport × writingMode の組み合わせで V === SOURCE が成立すること。
const WIDTH_MODES: ReadonlyArray<string> = ['10em', '14em', '20em'];

function buildWidthUrl(params: {
  columnWidth: string;
  writingMode: WritingMode;
  obstacle: ObstacleKind;
  text: string;
}): string {
  const q = new URLSearchParams({
    columnWidth: params.columnWidth,
    writingMode: params.writingMode,
    obstacle: params.obstacle,
    text: params.text,
  });
  return `/e2e/fixtures/v0.4/?${q.toString()}`;
}

test.describe('v0.4 flow-engine width mode (V === S)', () => {
  for (const viewport of VIEWPORTS) {
    for (const writingMode of WRITING_MODES) {
      for (const columnWidth of WIDTH_MODES) {
        const title = `vw=${viewport.width} wm=${writingMode} width=${columnWidth}`;
        test(title, async ({ browser }) => {
          const ctx = await browser.newContext({ viewport });
          const page = await ctx.newPage();
          try {
            await page.goto(
              buildWidthUrl({ columnWidth, writingMode, obstacle: 'none', text: SOURCE }),
            );
            await page.waitForSelector('#app[data-ready="true"]');
            await waitForTilePageReady(page);

            const { text: V } = await visibleTextOf(page, { rootSelector: '.tilepage-book' });
            expect(V).toBe(SOURCE);
          } finally {
            await ctx.close();
          }
        });
      }
    }
  }
});
