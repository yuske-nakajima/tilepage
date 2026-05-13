import css from './tilepage.css?raw';

export function injectStyles(doc: Document = document): void {
	if (typeof doc === 'undefined') return;
	if (doc.head.querySelector('style[data-tilepage="styles"]')) return;
	const style = doc.createElement('style');
	style.dataset.tilepage = 'styles';
	style.textContent = css;
	doc.head.appendChild(style);
}
