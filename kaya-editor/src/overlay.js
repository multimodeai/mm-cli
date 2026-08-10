import { KAYA_PREFIX, OVERLAY_STYLE } from './constants.js';

export const OVERLAY_SCRIPT = `
(() => {
  const base = '${KAYA_PREFIX}';
  const html = document.documentElement;
  const state = { annotate:false, queued:[], ended:false, lastReply:'', suppressClick:false, ctx:null, ref:null };
  const clientId = 'c' + Math.random().toString(36).slice(2, 12);
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function clip(s,n){ s=String(s==null?'':s).replace(/\\s+/g,' ').trim(); return s.length>n ? s.slice(0,n)+'\\u2026' : s; }

  const root = document.createElement('div'); root.id='kaya-overlay';

  const nav = document.createElement('header'); nav.id='kaya-nav'; nav.setAttribute('aria-label','Multimode Kaya Editor review');
  nav.innerHTML = '<div class="kaya-brandwrap"><span class="kaya-brand">Kaya</span><span class="kaya-brand-sub">Editor</span></div>'
    + '<div class="kaya-nav-right">'
    + '<label class="kaya-toggle"><input type="checkbox" data-kaya-annotate><span class="kaya-switch"></span>Annotate</label>'
    + '<div class="kaya-menuwrap"><button class="kaya-menubtn" data-menu-btn aria-label="Menu">\\u22ee</button>'
    + '<div class="kaya-menu" data-menu>'
    + '<div class="kaya-menu-file" data-menu-file>artifact</div>'
    + '<button class="kaya-menu-item" data-menu-reload>Reload artifact</button>'
    + '<button class="kaya-menu-item" data-menu-copy>Copy file path</button>'
    + '<button class="kaya-menu-item" data-menu-export>Export standalone HTML</button>'
    + '<button class="kaya-menu-item kaya-menu-danger" data-menu-end>End session</button>'
    + '</div></div></div>';

  const hl = document.createElement('div'); hl.id='kaya-hl';

  const pop = document.createElement('div'); pop.id='kaya-pop';
  pop.innerHTML = '<div class="kaya-pop-head" data-pop-head></div>'
    + '<textarea data-pop-input placeholder="Tell the agent what to change here..."></textarea>'
    + '<div class="kaya-pop-hint">Enter to queue \\u00b7 \\u2318 + Enter to send now</div>'
    + '<div class="kaya-pop-actions"><button class="kaya-pop-cancel" data-pop-cancel>Cancel</button><button class="kaya-pop-queue" data-kaya-queue data-pop-queue>Queue</button></div>';

  const convo = document.createElement('aside'); convo.id='kaya-convo';
  convo.innerHTML = '<div class="kaya-convo-head"><span class="kaya-convo-title">Conversation</span><span class="kaya-count" data-count>0</span></div>'
    + '<div class="kaya-log" data-log data-kaya-reply></div>'
    + '<div class="kaya-pending" data-pending></div>'
    + '<div class="kaya-otherbanner" data-otherbanner>This review is open in another tab. <button data-takeover>Take over here</button></div>'
    + '<div class="kaya-composer"><textarea data-input placeholder="Write a message for the agent..."></textarea>'
    + '<div class="kaya-send-row"><button class="kaya-btn-primary" data-send>Send to Agent</button><button class="kaya-btn-ghost" data-end>Send &amp; End</button></div></div>';

  root.appendChild(nav); root.appendChild(hl); root.appendChild(pop); root.appendChild(convo);
  html.appendChild(root);

  const q = function(sel,r){ return (r||convo).querySelector(sel); };
  const logEl = q('[data-log]'); const composerInput = q('[data-input]'); const pendingEl = q('[data-pending]'); const countEl = q('[data-count]');
  const annBox = nav.querySelector('[data-kaya-annotate]');
  const popHead = pop.querySelector('[data-pop-head]'); const popInput = pop.querySelector('[data-pop-input]');

  function layout(){
    const bottom = window.innerWidth < 980;
    convo.classList.toggle('kaya-dock-bottom', bottom);
    convo.classList.toggle('kaya-dock-right', !bottom);
    html.style.paddingTop = '52px';
    if(bottom){ html.style.paddingRight=''; html.style.paddingBottom='44vh'; }
    else { html.style.paddingBottom=''; html.style.paddingRight='400px'; }
  }
  layout(); window.addEventListener('resize', layout);

  function isOurs(el){ return !el || root.contains(el); }
  function isNative(el){ return el && el.closest && el.closest('a,button,input,select,textarea,label,summary,[contenteditable],[data-kaya-action]'); }
  function selectorFor(element){
    if(!element || element===document.body || element===html) return 'body';
    const parts=[]; let cur=element;
    while(cur && cur.nodeType===1 && cur!==document.body && parts.length<5){
      let part=cur.tagName.toLowerCase();
      if(cur.id) part+='#'+CSS.escape(cur.id);
      else if(cur.classList.length) part+='.'+Array.from(cur.classList).slice(0,2).map(function(c){return CSS.escape(c);}).join('.');
      parts.unshift(part); cur=cur.parentElement;
    }
    return parts.join(' > ')||'body';
  }
  function refFor(el){ const t=clip(el.textContent, 70); return t || ('the '+el.tagName.toLowerCase()+' element'); }
  // Highlight box intentionally removed: covering whole sections was noise. The
  // annotation target is still tracked internally (selector + ref + selected
  // text) and shown compactly in the popup + the queued-note list, so the agent
  // knows exactly what each note refers to without painting over the artifact.
  function placeHl(){ /* no-op */ }
  function hideHl(){ hl.style.display='none'; hl.classList.remove('kaya-lock'); }

  annBox.addEventListener('change', function(){ state.annotate=annBox.checked; html.classList.toggle('kaya-annotate', state.annotate); if(!state.annotate){ hideHl(); closePop(); } });

  document.addEventListener('mousemove', function(e){
    if(!state.annotate || pop.classList.contains('kaya-show')) return;
    const el=e.target;
    if(isOurs(el) || !el || el.nodeType!==1){ hideHl(); return; }
    placeHl(el.getBoundingClientRect(), false);
  }, true);

  document.addEventListener('mouseup', function(){
    if(!state.annotate) return;
    setTimeout(function(){
      const sel=window.getSelection && window.getSelection();
      const text=sel ? sel.toString().trim() : '';
      if(!text || !sel.rangeCount) return;
      const anchor=sel.anchorNode && (sel.anchorNode.nodeType===1 ? sel.anchorNode : sel.anchorNode.parentElement);
      if(isOurs(anchor)) return;
      state.suppressClick=true; setTimeout(function(){ state.suppressClick=false; }, 350);
      try { const r=sel.getRangeAt(0).getBoundingClientRect(); placeHl(r, true); openPop(r.left, r.bottom, '\\u201c'+clip(text,80)+'\\u201d', { selector:selectorFor(anchor), selectedText:text }); } catch(_e){}
    }, 0);
  }, true);

  document.addEventListener('click', function(e){
    if(!state.annotate || isOurs(e.target)) return;
    if(state.suppressClick){ state.suppressClick=false; return; }
    if(isNative(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    const el=e.target; placeHl(el.getBoundingClientRect(), true);
    openPop(e.clientX, e.clientY, refFor(el), { selector:selectorFor(el) });
  }, true);

  function openPop(x, y, ref, ctx){
    state.ctx=ctx; state.ref=ref;
    popHead.innerHTML='Annotate <b>'+esc(ref)+'</b>';
    popInput.value='';
    pop.classList.add('kaya-show');
    const pw=pop.offsetWidth||322, ph=pop.offsetHeight||190;
    let px=Math.min(x, window.innerWidth-pw-12); px=Math.max(12, px);
    let py=Math.min(y+10, window.innerHeight-ph-12); py=Math.max(60, py);
    pop.style.left=px+'px'; pop.style.top=py+'px';
    popInput.focus();
  }
  function closePop(){ pop.classList.remove('kaya-show'); state.ctx=null; state.ref=null; hideHl(); }
  pop.querySelector('[data-pop-cancel]').addEventListener('click', closePop);
  pop.querySelector('[data-pop-queue]').addEventListener('click', function(){ queueFromPop(false); });
  popInput.addEventListener('keydown', function(e){
    if(e.key==='Enter' && (e.metaKey||e.ctrlKey)){ e.preventDefault(); queueFromPop(true); }
    else if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); queueFromPop(false); }
    else if(e.key==='Escape'){ e.preventDefault(); closePop(); }
  });
  function queueFromPop(sendNow){
    const note=popInput.value.trim(); if(!note) return;
    const ctx=state.ctx||{};
    addQueued({ ref:state.ref, note:note, display:note, agentText:note, selector:ctx.selector, selectedText:ctx.selectedText });
    closePop();
    if(sendNow) send();
  }

  function addQueued(item){ state.queued.push(item); renderPending(); }
  function renderPending(){
    countEl.textContent=String(state.queued.length);
    countEl.classList.toggle('kaya-on', state.queued.length>0);
    pendingEl.innerHTML=state.queued.map(function(it,i){
      const ref = it.ref ? '<div class="kaya-pi-ref">'+esc(it.ref)+'</div>' : '';
      return '<div class="kaya-pitem"><div class="kaya-pi-body">'+ref+'<div class="kaya-pi-note">'+esc(it.display||it.note||'')+'</div></div><span class="kaya-pi-x" data-i="'+i+'">\\u00d7</span></div>';
    }).join('');
  }
  pendingEl.addEventListener('click', function(e){ const i=e.target && e.target.getAttribute && e.target.getAttribute('data-i'); if(i!=null){ state.queued.splice(Number(i),1); renderPending(); } });

  let historyKey='';
  function renderHistory(hist){
    const key=hist.length+':'+(hist.length?(hist[hist.length-1].text||'').length:0);
    if(key===historyKey) return; historyKey=key;
    if(!hist.length){ logEl.innerHTML='<div class="kaya-empty">No messages yet.<br>Flip on <b>Annotate</b>, click a box or select some text, add a note, then <b>Send to Agent</b>.</div>'; return; }
    let round=0, out='';
    for(let k=0;k<hist.length;k++){ const m=hist[k];
      if(m.role==='agent'){ round++; out+='<div class="kaya-msg agent"><span class="kaya-who">Agent <span class="kaya-round">Round '+round+'</span></span>'+esc(m.text)+'</div>'; }
      else { out+='<div class="kaya-msg you"><span class="kaya-who">You</span>'+(m.ref?'<span class="kaya-ref">'+esc(m.ref)+'</span>':'')+esc(m.text)+'</div>'; }
    }
    logEl.innerHTML=out; logEl.scrollTop=logEl.scrollHeight;
  }

  async function send(){
    const msg=composerInput.value.trim();
    if(msg){ state.queued.push({ ref:null, note:msg, display:msg, agentText:msg }); composerInput.value=''; }
    const items=state.queued.splice(0); renderPending();
    for(let k=0;k<items.length;k++){ const it=items[k];
      try{ await fetch(base+'/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ text: it.agentText, tag:'comment', selector: it.selector, selectedText: it.selectedText, ref: it.ref||null })}); }
      catch(_e){ state.queued.unshift(it); renderPending(); return; }
    }
    refresh();
  }
  q('[data-send]').addEventListener('click', function(){ send(); });
  q('[data-end]').addEventListener('click', async function(){ await send(); try{ await fetch(base+'/end',{method:'POST'}); state.ended=true; refresh(); }catch(_e){} });
  composerInput.addEventListener('keydown', function(e){ if(e.key==='Enter' && (e.metaKey||e.ctrlKey)){ e.preventDefault(); send(); } });

  // ---- navbar overflow menu ----
  const menu = nav.querySelector('[data-menu]');
  const menuWrap = nav.querySelector('.kaya-menuwrap');
  const menuFileEl = nav.querySelector('[data-menu-file]');
  let filePath = '';
  fetch(base+'/health').then(function(r){ return r.json(); }).then(function(d){ filePath=d.file||''; if(menuFileEl) menuFileEl.textContent = (filePath.split('/').pop()) || 'artifact'; }).catch(function(){});
  function closeMenu(){ menu.classList.remove('kaya-open'); }
  nav.querySelector('[data-menu-btn]').addEventListener('click', function(){ menu.classList.toggle('kaya-open'); });
  document.addEventListener('mousedown', function(e){ if(!menuWrap.contains(e.target)) closeMenu(); }, true);
  nav.querySelector('[data-menu-reload]').addEventListener('click', function(){ closeMenu(); window.location.reload(); });
  nav.querySelector('[data-menu-copy]').addEventListener('click', function(){ closeMenu(); if(navigator.clipboard && filePath) navigator.clipboard.writeText(filePath); });
  nav.querySelector('[data-menu-export]').addEventListener('click', function(){ closeMenu(); const a=document.createElement('a'); a.href=base+'/export'; a.download=''; document.body.appendChild(a); a.click(); a.remove(); });
  nav.querySelector('[data-menu-end]').addEventListener('click', async function(){ closeMenu(); try{ await fetch(base+'/end',{method:'POST'}); state.ended=true; refresh(); }catch(_e){} });

  // ---- multi-tab awareness ----
  const bannerEl = q('[data-otherbanner]');
  bannerEl.querySelector('[data-takeover]').addEventListener('click', function(){ fetch(base+'/claim?client='+clientId,{method:'POST'}).catch(function(){}); bannerEl.classList.remove('kaya-show'); });

  window.kaya = {
    queuePrompt: function(prompt, opts){ opts=opts||{}; addQueued({ ref:null, note:prompt, display: opts.text || prompt, agentText: prompt, selector: opts.selector||null, selectedText: opts.selectedText||null }); },
    sendQueuedPrompts: function(){ send(); }
  };
  if(!window.lavish) window.lavish = window.kaya;

  logEl.innerHTML='<div class="kaya-empty">No messages yet.<br>Flip on <b>Annotate</b>, click a box or select some text, add a note, then <b>Send to Agent</b>.</div>';
  async function refresh(){
    try{ const r=await fetch(base+'/state?client='+clientId); if(!r.ok) return; const d=await r.json();
      renderHistory(d.history||[]);
      state.ended=Boolean(d.ended);
      bannerEl.classList.toggle('kaya-show', (d.clients||1) > 1 && !!d.primary && d.primary!==clientId);
    } catch(_e){}
  }
  refresh(); window.setInterval(refresh, 1200);
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

// Default the review canvas to dark. Injected early (top of <head>) so an
// artifact that declares its own theme still wins; only pages that leave the
// background unset fall through to this dark default.
export function injectBaseTheme(html) {
  const style = '<style id="kaya-base">html{background:#0b0b0b;color-scheme:dark}body{background-color:#0f0f0f;color:#e8e8e8}</style>';
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${style}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1>${style}`);
  return `${style}${html}`;
}
