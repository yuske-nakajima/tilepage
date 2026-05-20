import {
  addFlow,
  addObstacleHorizontal,
  addPage,
  type Book,
  createBook,
  type ParagraphKinsoku,
  type ParagraphOptions,
} from '../../../src';

// addFlow の paragraph オプションを URL クエリで切り替える E2E fixture。
//
// クエリ:
//   indent=<CSS 長さ> (例: '1em', '2em', '0')
//   justify=true / false
//   kinsoku=strict / normal / none
//   hanging=true / false
//
// URL に何も付けなければ paragraph 未指定 (= data 属性 / CSS パススルー無し) のベースラインになる。

function parseQuery(): ParagraphOptions | undefined {
  const q = new URLSearchParams(window.location.search);
  const indent = q.get('indent');
  const justifyRaw = q.get('justify');
  const kinsokuRaw = q.get('kinsoku');
  const hangingRaw = q.get('hanging');

  // 何も指定されていなければ undefined を返して paragraph 未指定 baseline を作る。
  if (indent === null && justifyRaw === null && kinsokuRaw === null && hangingRaw === null) {
    return undefined;
  }

  const out: ParagraphOptions = {};
  if (indent !== null) out.indent = indent;
  if (justifyRaw !== null) out.justify = justifyRaw === 'true';
  if (kinsokuRaw === 'strict' || kinsokuRaw === 'normal' || kinsokuRaw === 'none') {
    out.kinsoku = kinsokuRaw as ParagraphKinsoku;
  }
  if (hangingRaw !== null) out.hangingPunctuation = hangingRaw === 'true';
  return out;
}

const DEFAULT_TEXT =
  'TilePage paragraph option fixture。' +
  '段落整形の CSS パススルーを E2E で検証するための本文。' +
  '走れメロスは激怒した。必ず、かの邪知暴虐の王を除かなければならぬと決意した。' +
  '英数字 mix: The quick brown fox jumps over the lazy dog 0123456789.' +
  '行送りを十分に確保するためにある程度長めの本文を用意しておく。' +
  '段組みは複数列、 page も 2 つ以上に渡る前提で書く。';

function setup(): void {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');

  const paragraph = parseQuery();

  const book = createBook({
    container: app,
    columns: 3,
    writingMode: 'horizontal-tb',
    gutter: '1em',
    padding: '2em 1.5em',
  });

  // 1 page 目を obstacle で保持しておくと flow が短くても trimPagesAfter で消えない。
  addPage(book);
  addObstacleHorizontal(book, {
    shape: 'rect',
    whenColumns: { 3: { page: 1, at: { col: 1, line: 1 }, cols: 1, lines: 1 } },
  });

  addFlow(book, { text: DEFAULT_TEXT, paragraph });

  (
    window as unknown as {
      __tilepageParagraph: { book: Book; paragraph: ParagraphOptions | undefined };
    }
  ).__tilepageParagraph = {
    book,
    paragraph,
  };
  app.dataset.ready = 'true';
}

setup();
