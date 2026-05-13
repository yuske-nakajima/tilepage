import { describe, expect, it } from 'vitest';
import { intersect } from '../intersect';

describe('intersect', () => {
	it('完全に重なる矩形は同じ矩形を返す', () => {
		const r = { x: 0, y: 0, width: 10, height: 10 };
		expect(intersect(r, r)).toEqual(r);
	});

	it('一部重なる矩形の交差領域を返す', () => {
		const a = { x: 0, y: 0, width: 10, height: 10 };
		const b = { x: 5, y: 5, width: 10, height: 10 };
		expect(intersect(a, b)).toEqual({ x: 5, y: 5, width: 5, height: 5 });
	});

	it('接するだけの矩形は null を返す', () => {
		const a = { x: 0, y: 0, width: 10, height: 10 };
		const b = { x: 10, y: 0, width: 10, height: 10 };
		expect(intersect(a, b)).toBeNull();
	});

	it('離れた矩形は null を返す', () => {
		const a = { x: 0, y: 0, width: 10, height: 10 };
		const b = { x: 20, y: 20, width: 10, height: 10 };
		expect(intersect(a, b)).toBeNull();
	});

	it('片方が他方に含まれる場合は内側の矩形を返す', () => {
		const outer = { x: 0, y: 0, width: 100, height: 100 };
		const inner = { x: 10, y: 10, width: 20, height: 20 };
		expect(intersect(outer, inner)).toEqual(inner);
	});
});
