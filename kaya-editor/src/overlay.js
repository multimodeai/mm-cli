import { KAYA_PREFIX, OVERLAY_STYLE } from './constants.js';

export const OVERLAY_SCRIPT = `
(() => {
  const base = '${KAYA_PREFIX}';
  const state = { context: null, queued: 0, ended: false };
  const root = document.createElement('aside');
  root.id = 'kaya-overlay';
  root.innerHTML = '<div class="kaya-card" role="complementary" aria-label="Multimode Kaya review"><div class="kaya-head"><span class="kaya-brand">Multimode · Kaya</span><span class="kaya-status" data-kaya-status>connected</span></div><div class="kaya-body"><div class="kaya-reply" data-kaya-reply>Waiting for the agent...</div><div class="kaya-context" data-kaya-context>Click an element or select text to attach context.</div><textarea data-kaya-input placeholder="What should change?"></textarea><select data-kaya-tag><option value="comment">Comment</option><option value="change">Change</option><option value="question">Question</option><option value="approve">Approve</option></select><div class="kaya-actions"><button data-kaya-queue>Queue feedback</button><button class="kaya-secondary" data-kaya-end>End session</button></div><div class="kaya-queue" data-kaya-queue-count>0 queued</div><div class="kaya-hint">Feedback is sent to the local Kaya session. You can queue several prompts before the agent polls.</div></div></div>';
  document.documentElement.appendChild(root);
  const $ = (selector) => root.querySelector(selector);
  const reply = $('[data-kaya-reply]');
  const context = $('[data-kaya-context]');
  const input = $('[data-kaya-input]');
  const tag = $('[data-kaya-tag]');
  const status = $('[data-kaya-status]');
  const queueCount = $('[data-kaya-queue-count]');

  function selectorFor(element) {
    if (!element || element === document.body || element === document.documentElement) return 'body';
    const parts = [];
    let current = element;
    while (current && current.nodeType === 1 && current !== document.body && parts.length < 5) {
      let part = current.tagName.toLowerCase();
      if (current.id) part += '#' + CSS.escape(current.id);
      else if (current.classList.length) part += '.' + Array.from(current.classList).slice(0, 2).map(CSS.escape).join('.');
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ') || 'body';
  }

  function setContext(next) {
    state.context = next;
    if (!next) { context.textContent = 'Click an element or select text to attach context.'; return; }
    const label = next.tag + (next.selectedText ? ': "' + next.selectedText.slice(0, 90) + '"' : '');
    context.textContent = 'Attached to ' + label + ' (' + next.selector + ')';
  }

  function visibleTarget(target) {
    return target && target.nodeType === 1 && !root.contains(target);
  }

  document.addEventListener('click', (event) => {
    if (visibleTarget(event.target)) setContext({ tag: 'element', selector: selectorFor(event.target) });
  }, true);
  document.addEventListener('mouseup', () => {
    const selection = window.getSelection && window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';
    if (!selectedText || !selection.rangeCount) return;
    const element = selection.anchorNode && (selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement);
    if (visibleTarget(element)) setContext({ tag: 'text', selector: selectorFor(element), selectedText });
  }, true);

  $('[data-kaya-queue]').addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text || state.ended) return;
    try {
      const response = await fetch(base + '/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, tag: tag.value, selector: state.context && state.context.selector, selectedText: state.context && state.context.selectedText }) });
      if (!response.ok) throw new Error('feedback rejected');
      state.queued += 1;
      queueCount.textContent = state.queued + ' queued';
      input.value = '';
      setContext(null);
    } catch (_error) { status.textContent = 'offline'; }
  });

  $('[data-kaya-end]').addEventListener('click', async () => {
    try { await fetch(base + '/end', { method: 'POST' }); state.ended = true; status.textContent = 'ended'; }
    catch (_error) { status.textContent = 'offline'; }
  });

  async function refresh() {
    try {
      const response = await fetch(base + '/state');
      if (!response.ok) throw new Error('state unavailable');
      const data = await response.json();
      reply.textContent = data.agentReply || 'Waiting for the agent...';
      state.ended = Boolean(data.ended);
      status.textContent = state.ended ? 'ended' : 'connected';
    } catch (_error) { status.textContent = 'offline'; }
  }
  refresh();
  window.setInterval(refresh, 1000);
})();
`;

export function overlayMarkup() {
  return `<style id="kaya-overlay-style">${OVERLAY_STYLE}</style><script id="kaya-overlay-script">${OVERLAY_SCRIPT}</script>`;
}

export function injectOverlay(html) {
  const marker = overlayMarkup();
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${marker}</body>`);
  return `${html}\n${marker}`;
}
