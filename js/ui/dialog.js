// Native <dialog> wrapper (focus trap, Escape and inert background come for free), plus toasts.
import { html } from './html.js';
import { icon } from './icons.js';
import { tr } from '../i18n.js';

// Close and remove a dialog right away. We do not wait for the native `close` event:
// it is queued and can be delayed (e.g. in background tabs), which would stall confirms.
function dispose(d) {
  if (d.dataset.disposed) return;
  d.dataset.disposed = '1';
  if (d.open) d.close();
  d.remove();
  d.dispatchEvent(new CustomEvent('dialog-done'));
  const back = d._opener;
  if (back && document.contains(back)) back.focus();
}

export function openDialog({ title, body, footer, wide = false }) {
  closeDialogs();
  const d = document.createElement('dialog');
  d._opener = document.activeElement;
  d.className = `dialog${wide ? ' dialog--wide' : ''}`;
  d.setAttribute('aria-labelledby', 'dialog-title');
  d.innerHTML = String(html`<div class="dialog__inner">
    <div class="dialog__head"><h2 id="dialog-title" class="dialog__title">${title}</h2>
      <button type="button" class="icon-btn" data-action="dialog-close" aria-label="${tr('Close')}">${icon('x')}</button></div>
    <div class="dialog__body">${body}</div>
    ${footer ? html`<div class="dialog__foot">${footer}</div>` : ''}
  </div>`);
  document.body.append(d);
  d.addEventListener('close', () => dispose(d)); // Escape key
  d.addEventListener('mousedown', (e) => { if (e.target === d) dispose(d); });
  d.showModal();
  const first = d.querySelector('[autofocus], .dialog__body input:not([type=hidden]), .dialog__body select, .dialog__body textarea');
  (first || d.querySelector('.dialog__foot .btn:last-child') || d).focus();
  return d;
}

export function closeDialogs() {
  document.querySelectorAll('dialog.dialog').forEach(dispose);
}

/** Close the dialog that contains `el` (used by the dialog's own close button). */
export function closeDialogOf(el) {
  const d = el.closest('dialog');
  if (d) dispose(d);
}

export function confirmDialog({ title, body, confirmLabel = tr('Confirm'), cancelLabel = tr('Cancel'), tone = 'primary' }) {
  return new Promise((resolve) => {
    const d = openDialog({
      title, body,
      footer: html`<button type="button" class="btn btn--secondary" data-dlg="cancel">${cancelLabel}</button><button type="button" class="btn btn--${tone}" data-dlg="ok">${confirmLabel}</button>`,
    });
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dlg]');
      if (!b) return;
      resolve(b.dataset.dlg === 'ok'); // resolve before dispose, which fires dialog-done
      dispose(d);
    });
    // Escape, backdrop or the X button: treat as "no". resolve() only counts the first call.
    d.addEventListener('dialog-done', () => resolve(false), { once: true });
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
