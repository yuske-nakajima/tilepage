/// <reference types="vite/client" />
import { addFlow, addObstacle, addPage, type Book, createBook } from '../../src';
import merosText from '../meros.txt?raw';

// columns-variant demo (Sprint 5 で書き直す本番 demo の Sprint 2 RED 用 draft)。
// supportedColumns + breakpoints + whenColumns API は Sprint 3/4 で実装される。
// Sprint 2 時点では型エラー / runtime エラーが許容される前提で、 @ts-expect-error と
// try/catch で「テストが構文エラーで起動すらしない」状態を避け、 必ず
// data-ready="true" まで到達して E2E が assertion fail で RED になるようにする。

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

const SOURCE_TEXT = merosText.trim();

// supportedColumns + breakpoints は Sprint 3 で導入される。
// ts レベルでは ColumnsConfig Union に存在しないため @ts-expect-error で抑制する。
// Sprint 2 時点ではこの呼び出しは N=1 にフォールバックする (deriveColumnsFromWidth が
// width フィールドを見つけられず NaN 経由で 1 を返す)。 Sprint 3 で正しく N が解決される。
const book: Book = createBook({
  container: app,
  // @ts-expect-error supportedColumns mode は Sprint 3 実装対象
  columns: {
    supported: [2, 4, 6, 8],
    breakpoints: { 8: '90em', 6: '60em', 4: '40em', 2: '0' },
  },
  gutter: '0.8em',
  padding: '4em 1.5em',
});

// 各 obstacle に data-id を持たせて E2E から個別に locator できるようにする。
function tagObstacle(el: HTMLElement | undefined, id: string): void {
  if (!el) return;
  el.setAttribute('data-id', id);
}

// Sprint 2 では addObstacle(book, ...) overload も whenColumns 解決も未実装。
// 呼び出しが throw しても data-ready は必ず立てて E2E が assertion レベルで RED に
// 落ちるようにする。
function safeAddObstacleWithVariant(id: string, options: Record<string, unknown>): void {
  try {
    // @ts-expect-error addObstacle(book, { whenColumns }) overload は Sprint 4 で追加
    const obs = addObstacle(book, options) as { element?: HTMLElement } | undefined;
    tagObstacle(obs?.element, id);
  } catch (_err) {
    // Sprint 3/4 実装前は呼び出しが落ちる。 Sprint 2 では RED 観測のみが目的。
  }
}

// 雑誌的に King の大判画像。 N=6 を意図的に省略して graceful degrade を確認する。
safeAddObstacleWithVariant('king', {
  shape: 'rect',
  src: '/meros-1-king.png',
  whenColumns: {
    2: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 8 },
    4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 6 },
    // 6 は意図的に省略 (graceful degrade テスト用)
    8: { page: 1, at: { col: 1, line: 1 }, cols: 3, lines: 7 },
  },
});

// 走るメロス。 全 N (2/4/6/8) で variant を宣言。
safeAddObstacleWithVariant('run', {
  shape: 'circle',
  src: '/meros-2-run.png',
  whenColumns: {
    2: { page: 1, at: { col: 1, line: 10 }, cols: 2, lines: 6 },
    4: { page: 1, at: { col: 3, line: 3 }, cols: 2, lines: 5 },
    6: { page: 1, at: { col: 4, line: 5 }, cols: 2, lines: 6 },
    8: { page: 1, at: { col: 5, line: 4 }, cols: 3, lines: 6 },
  },
});

// 再会の polygon。 page 2 に配置。
safeAddObstacleWithVariant('reunion', {
  shape: {
    type: 'polygon',
    points: [
      [0.5, 0],
      [1, 0.5],
      [0.5, 1],
      [0, 0.5],
    ],
  },
  src: '/meros-3-reunion.png',
  whenColumns: {
    2: { page: 2, at: { col: 1, line: 1 }, cols: 2, lines: 5 },
    4: { page: 2, at: { col: 2, line: 2 }, cols: 2, lines: 5 },
    6: { page: 2, at: { col: 3, line: 3 }, cols: 2, lines: 6 },
    8: { page: 2, at: { col: 4, line: 4 }, cols: 3, lines: 6 },
  },
});

// page を最低 2 つは確保する (degrade テストで page=2 variant が ensure される前提)。
try {
  if (book.pages.length < 1) addPage(book);
  if (book.pages.length < 2) addPage(book);
} catch (_err) {
  // Sprint 2 では addPage が失敗しても data-ready は立てる。
}

try {
  addFlow(book, { text: SOURCE_TEXT });
} catch (_err) {
  // Sprint 2 RED 時点では distribute が落ちる可能性も許容。
}

(
  window as unknown as { __tilepageColumnsVariant: { book: Book; sourceText: string } }
).__tilepageColumnsVariant = { book, sourceText: SOURCE_TEXT };

app.dataset.ready = 'true';
