// source text を「これ以上分割しても意味のない最小単位」に分解する。
// 単位は Grapheme Cluster ベース。`Intl.Segmenter` が利用可能ならそれを使い、
// 不可なら code-point 単位にフォールバックする。
export function splitGraphemes(text: string): string[] {
  const SegmenterCtor = (
    globalThis as unknown as {
      Intl?: { Segmenter?: new (loc?: string, opts?: { granularity?: string }) => Segmenter };
    }
  ).Intl?.Segmenter;
  if (SegmenterCtor) {
    const seg = new SegmenterCtor(undefined, { granularity: 'grapheme' });
    const result: string[] = [];
    for (const piece of seg.segment(text)) {
      result.push(piece.segment);
    }
    return result;
  }
  // フォールバック: code point 単位
  return Array.from(text);
}

interface Segmenter {
  segment(s: string): Iterable<{ segment: string }>;
}
