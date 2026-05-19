import {
  addFlow,
  addObstacleHorizontal,
  addObstacleVertical,
  addPage,
  type Book,
  type ColumnsConfig,
  createBook,
  type ObstacleShape,
  type WritingMode,
} from '../../../src';

type ObstacleKind = 'none' | 'rect' | 'circle' | 'polygon';

interface V04Params {
  columns: ColumnsConfig;
  writingMode: WritingMode;
  obstacle: ObstacleKind;
  text: string;
}

function parseQuery(): V04Params {
  const q = new URLSearchParams(window.location.search);
  // columnWidth が指定されていれば width モード優先。
  const columnWidth = q.get('columnWidth');
  let columns: ColumnsConfig;
  if (columnWidth && columnWidth.length > 0) {
    columns = { width: columnWidth };
  } else {
    const columnsRaw = Number.parseInt(q.get('columns') ?? '6', 10);
    columns = Number.isFinite(columnsRaw) && columnsRaw > 0 ? columnsRaw : 6;
  }
  const wmRaw = q.get('writingMode');
  const writingMode: WritingMode = wmRaw === 'vertical-rl' ? 'vertical-rl' : 'horizontal-tb';
  const obstacle = (q.get('obstacle') ?? 'none') as ObstacleKind;
  const text = q.get('text') ?? DEFAULT_TEXT;
  return { columns, writingMode, obstacle, text };
}

const DEFAULT_TEXT =
  'TilePage v0.4 flow-engine — 1 本の連続ストリームを N 段に流し込むデモ。' +
  '横書きでも縦書きでも同じエンジンが動くことを実証する。' +
  'duplicate しない、px 固定をしない、visible 文字数で検証する。' +
  '英数字 mix: The quick brown fox jumps over the lazy dog 0123456789.';

// 中央付近に「全幅の半分以下」のサイズで obstacle を配置する (全 column を覆わない)。
// 1 列以上は流せる位置を残すため、 obstacle が占有する列数は columns-1 を超えないようにする。
// 戻り値は段組み相対の start 段と span (= grid-column-start / grid-column span に流す)。
function computeObstaclePlacement(columns: number): { start: number; span: number } {
  if (columns <= 1) return { start: 1, span: 1 };
  const span = Math.max(1, Math.min(columns - 1, Math.ceil(columns / 3)));
  const start = Math.max(1, Math.floor((columns - span) / 2) + 1);
  return { start, span };
}

function shapeOf(kind: ObstacleKind): ObstacleShape | null {
  switch (kind) {
    case 'rect':
      return 'rect';
    case 'circle':
      return 'circle';
    case 'polygon':
      return {
        type: 'polygon',
        points: [
          [0.5, 0],
          [1, 0.5],
          [0.5, 1],
          [0, 0.5],
        ],
      };
    default:
      return null;
  }
}

function setup(): void {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');

  const params = parseQuery();
  const book = createBook({
    container: app,
    columns: params.columns,
    writingMode: params.writingMode,
  });

  // obstacle がある場合は最初の page を先に確保して obstacle を載せる。
  // 追加 page は addFlow 内部で必要なだけ ensurePage される。
  // 配置は columns に応じて book の中央付近に揃え、 grid の implicit 拡張を避ける。
  const shape = shapeOf(params.obstacle);
  if (shape) {
    addPage(book);
    // width モード時は page 作成時の book.columns (実測 N) を使う。
    const effectiveColumns = book.columns;
    const placement = computeObstaclePlacement(effectiveColumns);
    if (params.writingMode === 'vertical-rl') {
      // 縦書きでは段組み相対の「高さ」 = rows、 「char 位置」 = at.char。
      addObstacleVertical(book, {
        shape,
        shapeMargin: '0.8em',
        whenColumns: {
          [effectiveColumns]: {
            page: 1,
            at: { row: placement.start, char: 1 },
            rows: placement.span,
            chars: 2,
          },
        },
      });
    } else {
      addObstacleHorizontal(book, {
        shape,
        shapeMargin: '0.8em',
        whenColumns: {
          [effectiveColumns]: {
            page: 1,
            at: { col: placement.start, line: 1 },
            cols: placement.span,
            lines: 2,
          },
        },
      });
    }
  }

  addFlow(book, { text: params.text });

  (window as unknown as { __tilepageV04: { book: Book; params: V04Params } }).__tilepageV04 = {
    book,
    params,
  };
  app.dataset.ready = 'true';
}

setup();
