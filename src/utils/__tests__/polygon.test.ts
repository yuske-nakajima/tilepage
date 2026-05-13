import { describe, expect, it } from 'vitest';
import {
  circlePolygon,
  clipPolygonByRect,
  normalizeShape,
  type Point,
  shapeToClipPath,
} from '../polygon';

describe('circlePolygon', () => {
  it('指定した点数の polygon を返す', () => {
    expect(circlePolygon(4)).toHaveLength(4);
    expect(circlePolygon(32)).toHaveLength(32);
  });

  it('全ての点が単位矩形 [0,1] x [0,1] の中に収まる', () => {
    const pts = circlePolygon(32);
    const eps = 1e-9;
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0 - eps);
      expect(x).toBeLessThanOrEqual(1 + eps);
      expect(y).toBeGreaterThanOrEqual(0 - eps);
      expect(y).toBeLessThanOrEqual(1 + eps);
    }
  });

  it('全ての点が中心 (0.5, 0.5) から半径 0.5 の円上にある', () => {
    const pts = circlePolygon(32);
    for (const [x, y] of pts) {
      const r = Math.hypot(x - 0.5, y - 0.5);
      expect(r).toBeCloseTo(0.5, 9);
    }
  });

  it('点数が 3 未満の場合は例外を投げる', () => {
    expect(() => circlePolygon(2)).toThrow();
  });
});

describe('normalizeShape', () => {
  it("'rect' は 4 点の単位正方形 polygon を返す", () => {
    expect(normalizeShape('rect')).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  });

  it("'circle' は 32 点の polygon を返す", () => {
    expect(normalizeShape('circle')).toHaveLength(32);
  });

  it("'polygon' 型はそのままの点列を返す", () => {
    const pts: Point[] = [
      [0.5, 0],
      [1, 1],
      [0, 1],
    ];
    const result = normalizeShape({ type: 'polygon', points: pts });
    expect(result).toEqual(pts);
  });

  it('polygon の点数が 3 未満の場合は例外を投げる', () => {
    expect(() =>
      normalizeShape({
        type: 'polygon',
        points: [
          [0, 0],
          [1, 1],
        ],
      }),
    ).toThrow();
  });
});

describe('shapeToClipPath', () => {
  it('点を % 単位の polygon() 文字列に変換する', () => {
    const result = shapeToClipPath([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    expect(result).toBe('polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)');
  });
});

describe('clipPolygonByRect', () => {
  const rect = { x: 0, y: 0, width: 10, height: 10 };

  it('完全に内包される polygon はそのまま返す', () => {
    const poly: Point[] = [
      [2, 2],
      [8, 2],
      [8, 8],
      [2, 8],
    ];
    const result = clipPolygonByRect(poly, rect);
    expect(result).toEqual(poly);
  });

  it('完全に外側にある polygon は空配列を返す', () => {
    const poly: Point[] = [
      [20, 20],
      [30, 20],
      [30, 30],
      [20, 30],
    ];
    expect(clipPolygonByRect(poly, rect)).toEqual([]);
  });

  it('部分的に交差する polygon は交差領域を返す', () => {
    const poly: Point[] = [
      [-5, -5],
      [5, -5],
      [5, 5],
      [-5, 5],
    ];
    const result = clipPolygonByRect(poly, rect);
    // 期待: [0,0], [5,0], [5,5], [0,5] (順序は実装依存だが集合として一致)
    expect(result).toHaveLength(4);
    const xs = result.map((p) => p[0]).sort();
    const ys = result.map((p) => p[1]).sort();
    expect(xs).toEqual([0, 0, 5, 5]);
    expect(ys).toEqual([0, 0, 5, 5]);
  });

  it('三角形と矩形の交差を計算できる', () => {
    const triangle: Point[] = [
      [5, -5],
      [15, 5],
      [5, 15],
    ];
    const result = clipPolygonByRect(triangle, rect);
    // 全ての結果点が矩形内に収まる
    for (const [x, y] of result) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(10);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(10);
    }
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('矩形が完全に polygon を含む場合は矩形そのものを返す', () => {
    const bigPoly: Point[] = [
      [-100, -100],
      [100, -100],
      [100, 100],
      [-100, 100],
    ];
    const result = clipPolygonByRect(bigPoly, rect);
    expect(result).toHaveLength(4);
    const xs = result.map((p) => p[0]).sort();
    const ys = result.map((p) => p[1]).sort();
    expect(xs).toEqual([0, 0, 10, 10]);
    expect(ys).toEqual([0, 0, 10, 10]);
  });
});
