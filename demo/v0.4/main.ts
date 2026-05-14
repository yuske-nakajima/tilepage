import {
  addFlow,
  addObstacle,
  addPage,
  type Book,
  createBook,
  type ObstacleShape,
} from '../../src';

type WritingMode = 'horizontal-tb' | 'vertical-rl';
type ObstacleKind = 'none' | 'rect' | 'circle' | 'polygon';

interface V04Params {
  columns: number;
  writingMode: WritingMode;
  obstacle: ObstacleKind;
  text: string;
}

function parseQuery(): V04Params {
  const q = new URLSearchParams(window.location.search);
  const columnsRaw = Number.parseInt(q.get('columns') ?? '6', 10);
  const columns = Number.isFinite(columnsRaw) && columnsRaw > 0 ? columnsRaw : 6;
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

interface CreateBookV04Options {
  container: HTMLElement;
  columns: number;
  writingMode: WritingMode;
}

function createBookV04(options: CreateBookV04Options): Book {
  // Sprint 3 で createBook({ writingMode }) を実装する想定。Sprint 2 時点では
  // 既存 createBook に columns だけ渡し、root 要素に data-writing-mode を付与して
  // CSS / 検証側から writing-mode を判別できるようにしておく。
  const book = createBook({
    container: options.container,
    columns: options.columns,
  });
  book.root.dataset.writingMode = options.writingMode;
  if (options.writingMode === 'vertical-rl') {
    book.root.style.writingMode = 'vertical-rl';
  }
  return book;
}

interface AddFlowV04Options {
  text: string;
}

function addFlowV04(book: Book, options: AddFlowV04Options): void {
  // Sprint 3 で addFlow(book, { text }) book 単位 + 動的 page 追加を実装する想定。
  // Sprint 2 時点では既存の page 単位 addFlow を fallback として呼ぶ。これにより
  // text が duplicate されて V !== S になり RED で fail するはず (これが目的)。
  if (book.pages.length === 0) {
    addPage(book);
  }
  for (const p of book.pages) {
    addFlow(p, { text: options.text });
  }
}

function setup(): void {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');

  const params = parseQuery();
  const book = createBookV04({
    container: app,
    columns: params.columns,
    writingMode: params.writingMode,
  });

  const page = addPage(book);
  page.element.dataset.writingMode = params.writingMode;

  const shape = shapeOf(params.obstacle);
  if (shape) {
    addObstacle(page, {
      at: { col: '2-4', row: '1-3' },
      shape,
      shapeMargin: '0.8em',
    });
  }

  addFlowV04(book, { text: params.text });

  // テスト側から book / page にアクセスできるようグローバルに公開
  (window as unknown as { __tilepageV04: { book: Book; params: V04Params } }).__tilepageV04 = {
    book,
    params,
  };
  app.dataset.ready = 'true';
}

setup();
