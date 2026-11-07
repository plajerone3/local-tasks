// Native <dialog> wrapper (focus trap, Escape and inert background come for free), plus toasts.
import { html } from './html.js';
import { icon } from './icons.js';

let opener = null;

export function openDialog({ title, body, footer, wide = false }) {
  closeDialogs();
  opener = document.activeElement;
  const d = document.createElement('dialog');
  d.className = `dialog${wide ? ' dialog--wide' : ''}`;
  d.setAttribute('aria-labelledby', 'dialog-title');
  d.innerHTML = String(html`<div class="dialog__inner">
    <div class="dialog__head"><h2 id="dialog-title" class="dialog__title">${title}</h2>
      <button type="button" class="icon-btn" data-action="dialog-close" aria-label="Close">${icon('x')}</button></div>
    <div class="dialog__body">${body}</div>
    ${footer ? html`<div class="dialog__foot">${footer}</div>` : ''}
  </div>`);
  document.body.append(d);
  d.addEventListener('close', () => {
    d.remove();
    if (opener && document.contains(opener)) opener.focus();
  });
  d.addEventListener('mousedown', (e) => { if (e.target === d) d.close(); });
  d.showModal();
  const first = d.querySelector('[autofocus], .dialog__body input:not([type=hidden]), .dialog__body select, .dialog__body textarea');
  (first || d.querySelector('.dialog__foot .btn:last-child') || d).focus();
  return d;
}

export function closeDialogs() {
  document.querySelectorAll('dialog.dialog').forEach((d) => (d.open ? d.close() : d.remove()));
}

export function confirmDialog({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary' }) {
  return new Promise((resolve) => {
    let result = false;
    const d = openDialog({
      title, body,
      footer: html`<button type="button" class="btn btn--secondary" data-dlg="cancel">${cancelLabel}</button><button type="button" class="btn btn--${tone}" data-dlg="ok">${confirmLabel}</button>`,
    });
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dlg]');
      if (!b) return;
      result = b.dataset.dlg === 'ok';
      d.close();
    });
    d.addEventListener('close', () => resolve(result), { once: true });
  });
}

export function toast(message, tone = 'success') {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.textContent = message;
  box.append(el);
  setTimeout(() => {
    el.classList.add('toast--out');
    setTimeout(() => el.remove(), 300);
  }, 4200);
}

export function announce(text) {
  const el = document.getElementById('sr-status');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 50);
}
