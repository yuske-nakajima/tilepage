export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function intersect(a: Rect, b: Rect): Rect | null {
	const x1 = Math.max(a.x, b.x);
	const y1 = Math.max(a.y, b.y);
	const x2 = Math.min(a.x + a.width, b.x + b.width);
	const y2 = Math.min(a.y + a.height, b.y + b.height);
	if (x2 <= x1 || y2 <= y1) return null;
	return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
