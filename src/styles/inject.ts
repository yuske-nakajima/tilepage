import css from './tilepage.css?raw';

let injected = false;

export function injectStyles(): void {
	if (injected || typeof document === 'undefined') return;
	const style = document.createElement('style');
	style.dataset.tilepage = 'styles';
	style.textContent = css;
	document.head.appendChild(style);
	injected = true;
}
