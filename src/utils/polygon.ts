export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type Point = readonly [number, number];

export type ObstacleShape = 'rect' | 'circle' | { type: 'polygon'; points: ReadonlyArray<Point> };

const CIRCLE_POLYGON_POINTS = 32;

export function circlePolygon(n: number): Point[] {
	if (n < 3) throw new Error(`circlePolygon: n must be >= 3, got ${n}`);
	const pts: Point[] = [];
	for (let i = 0; i < n; i++) {
		const t = (i / n) * Math.PI * 2;
		pts.push([0.5 + 0.5 * Math.cos(t), 0.5 + 0.5 * Math.sin(t)]);
	}
	return pts;
}

export function normalizeShape(shape: ObstacleShape): Point[] {
	if (shape === 'rect') {
		return [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1],
		];
	}
	if (shape === 'circle') return circlePolygon(CIRCLE_POLYGON_POINTS);
	if (shape.type === 'polygon') {
		if (shape.points.length < 3) {
			throw new Error(`polygon: points must have >= 3 entries, got ${shape.points.length}`);
		}
		return shape.points.map(([x, y]) => [x, y] as Point);
	}
	throw new Error('unknown shape');
}

export function shapeToClipPath(polygon: ReadonlyArray<Point>): string {
	const inner = polygon.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(', ');
	return `polygon(${inner})`;
}

type Side = 'left' | 'right' | 'top' | 'bottom';

function isInside(p: Point, side: Side, rect: Rect): boolean {
	switch (side) {
		case 'left':
			return p[0] >= rect.x;
		case 'right':
			return p[0] <= rect.x + rect.width;
		case 'top':
			return p[1] >= rect.y;
		case 'bottom':
			return p[1] <= rect.y + rect.height;
	}
}

function intersectEdge(a: Point, b: Point, side: Side, rect: Rect): Point {
	const [ax, ay] = a;
	const [bx, by] = b;
	switch (side) {
		case 'left': {
			const x = rect.x;
			const t = (x - ax) / (bx - ax);
			return [x, ay + t * (by - ay)];
		}
		case 'right': {
			const x = rect.x + rect.width;
			const t = (x - ax) / (bx - ax);
			return [x, ay + t * (by - ay)];
		}
		case 'top': {
			const y = rect.y;
			const t = (y - ay) / (by - ay);
			return [ax + t * (bx - ax), y];
		}
		case 'bottom': {
			const y = rect.y + rect.height;
			const t = (y - ay) / (by - ay);
			return [ax + t * (bx - ax), y];
		}
	}
}

function clipBySide(polygon: ReadonlyArray<Point>, side: Side, rect: Rect): Point[] {
	if (polygon.length === 0) return [];
	const output: Point[] = [];
	for (let i = 0; i < polygon.length; i++) {
		const current = polygon[i];
		const prev = polygon[(i + polygon.length - 1) % polygon.length];
		const currentIn = isInside(current, side, rect);
		const prevIn = isInside(prev, side, rect);
		if (currentIn) {
			if (!prevIn) output.push(intersectEdge(prev, current, side, rect));
			output.push(current);
		} else if (prevIn) {
			output.push(intersectEdge(prev, current, side, rect));
		}
	}
	return output;
}

export function clipPolygonByRect(polygon: ReadonlyArray<Point>, rect: Rect): Point[] {
	let result: Point[] = [...polygon];
	for (const side of ['left', 'right', 'top', 'bottom'] as const) {
		result = clipBySide(result, side, rect);
		if (result.length === 0) return [];
	}
	return result;
}
