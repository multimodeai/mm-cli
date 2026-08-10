export const KAYA_PREFIX = '/__kaya';
export const DEFAULT_PORT = 41731;
export const POLL_TIMEOUT_MS = 30 * 60 * 1000;

export const OVERLAY_STYLE = `
#kaya-nav, #kaya-convo, #kaya-hl, #kaya-pop { --kt:#c75b3f; --kt2:#eb8f6a; --bg:#0b0b0b; --bg2:#151515; --bg3:#1d1d1d; --line:#2a2a2a; --ink:#f4f4f4; --muted:#9a9a9a; }
#kaya-nav, #kaya-nav *, #kaya-convo, #kaya-convo *, #kaya-hl, #kaya-pop, #kaya-pop * { box-sizing:border-box; font-family:ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }

/* Navbar */
#kaya-nav { position:fixed; top:0; left:0; right:0; height:52px; z-index:2147483645; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:0 18px 0 20px; background:#000; border-bottom:1px solid var(--line); box-shadow:0 2px 22px rgba(0,0,0,.5); color:var(--ink); }
#kaya-nav .kaya-brandwrap { display:flex; align-items:baseline; gap:9px; }
#kaya-nav .kaya-brand { font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif; font-style:italic; font-weight:600; font-size:23px; line-height:1; color:var(--kt2); }
#kaya-nav .kaya-brand-sub { font-size:10.5px; letter-spacing:.28em; font-weight:700; text-transform:uppercase; color:var(--muted); }
#kaya-nav .kaya-toggle { display:inline-flex; align-items:center; gap:9px; cursor:pointer; font-size:13px; font-weight:600; color:var(--ink); user-select:none; padding:6px 11px; border-radius:9px; }
#kaya-nav .kaya-toggle:hover { background:rgba(255,255,255,.06); }
#kaya-nav .kaya-toggle input { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }
#kaya-nav .kaya-switch { position:relative; width:38px; height:21px; border-radius:999px; background:#333; transition:background .16s; flex:none; }
#kaya-nav .kaya-switch::after { content:""; position:absolute; top:2px; left:2px; width:17px; height:17px; border-radius:50%; background:#ccc; transition:transform .16s, background .16s; }
#kaya-nav .kaya-toggle input:checked + .kaya-switch { background:var(--kt); }
#kaya-nav .kaya-toggle input:checked + .kaya-switch::after { transform:translateX(17px); background:#fff; }

/* Annotate highlight (no label) */
#kaya-hl { position:fixed; z-index:2147483643; pointer-events:none; display:none; border:2px solid var(--kt2); border-radius:5px; background:rgba(224,128,95,.12); box-shadow:0 0 0 1px rgba(0,0,0,.5); }
#kaya-hl.kaya-lock { border-color:var(--kt); background:rgba(199,91,63,.2); }
html.kaya-annotate { cursor:crosshair; }

/* Annotation popup */
#kaya-pop { position:fixed; z-index:2147483646; width:322px; max-width:calc(100vw - 24px); display:none; flex-direction:column; padding:13px; background:var(--bg); border:1px solid var(--line); border-radius:13px; box-shadow:0 18px 48px rgba(0,0,0,.6); color:var(--ink); }
#kaya-pop.kaya-show { display:flex; }
#kaya-pop .kaya-pop-head { font-size:11.5px; line-height:1.45; color:var(--muted); margin-bottom:9px; max-height:52px; overflow:hidden; }
#kaya-pop .kaya-pop-head b { color:var(--kt2); font-weight:700; font-style:normal; }
#kaya-pop textarea { display:block; width:100%; min-height:68px; resize:vertical; padding:9px 10px; border:1px solid var(--line); border-radius:9px; background:#000; color:var(--ink); font-size:13px; outline:none; }
#kaya-pop textarea:focus { border-color:var(--kt); }
#kaya-pop .kaya-pop-hint { margin-top:7px; font-size:10.5px; color:var(--muted); }
#kaya-pop .kaya-pop-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }
#kaya-pop .kaya-pop-cancel { height:32px; padding:0 13px; border:1px solid var(--line); border-radius:8px; background:transparent; color:var(--muted); font-size:12.5px; font-weight:600; cursor:pointer; }
#kaya-pop .kaya-pop-cancel:hover { color:var(--ink); }
#kaya-pop .kaya-pop-queue { height:32px; padding:0 15px; border:0; border-radius:8px; background:var(--kt); color:#fff; font-size:12.5px; font-weight:700; cursor:pointer; }

/* Conversation panel: right dock when wide, bottom dock when narrow */
#kaya-convo { position:fixed; z-index:2147483644; display:flex; flex-direction:column; background:var(--bg); color:var(--ink); }
#kaya-convo.kaya-dock-right { top:52px; right:0; bottom:0; width:400px; border-left:1px solid var(--line); box-shadow:-14px 0 44px rgba(0,0,0,.5); }
#kaya-convo.kaya-dock-bottom { left:0; right:0; bottom:0; height:44vh; border-top:1px solid var(--line); box-shadow:0 -12px 40px rgba(0,0,0,.5); }
#kaya-convo .kaya-convo-head { display:flex; align-items:center; gap:9px; padding:12px 16px; border-bottom:1px solid var(--line); }
#kaya-convo .kaya-convo-title { font-size:12px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:var(--muted); }
#kaya-convo .kaya-count { min-width:18px; height:18px; padding:0 5px; border-radius:999px; background:var(--kt); color:#fff; font-size:10px; font-weight:700; display:none; align-items:center; justify-content:center; }
#kaya-convo .kaya-count.kaya-on { display:inline-flex; }
#kaya-convo .kaya-log { flex:1 1 0; min-height:0; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:11px; }
#kaya-convo .kaya-msg { padding:10px 12px; border-radius:11px; font-size:13px; line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; }
#kaya-convo .kaya-msg .kaya-who { display:block; font-size:9.5px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; margin-bottom:5px; opacity:.85; }
#kaya-convo .kaya-msg .kaya-ref { display:block; margin-bottom:6px; padding:5px 8px; border-radius:7px; background:rgba(199,91,63,.14); border-left:2px solid var(--kt); font-size:11.5px; color:var(--kt2); font-style:italic; overflow-wrap:anywhere; }
#kaya-convo .kaya-msg.agent { background:var(--bg2); border-left:3px solid var(--kt); }
#kaya-convo .kaya-msg.agent .kaya-who { color:var(--kt2); }
#kaya-convo .kaya-msg.you { background:var(--bg3); }
#kaya-convo .kaya-msg.you .kaya-who { color:var(--muted); }
#kaya-convo .kaya-empty { margin:auto; text-align:center; color:var(--muted); font-size:12.5px; line-height:1.55; padding:0 22px; }
#kaya-convo .kaya-pending { flex:0 1 auto; min-height:0; max-height:30vh; overflow-y:auto; padding:2px 14px; display:flex; flex-direction:column; gap:7px; }
#kaya-convo .kaya-pending:empty { display:none; }
#kaya-convo .kaya-pitem { display:flex; align-items:flex-start; gap:8px; padding:8px 10px; border-radius:9px; background:var(--bg2); border:1px solid var(--line); font-size:12px; line-height:1.45; }
#kaya-convo .kaya-pitem .kaya-pi-body { flex:1; min-width:0; }
#kaya-convo .kaya-pitem .kaya-pi-ref { display:none; margin-bottom:4px; color:var(--kt2); font-style:italic; overflow-wrap:anywhere; }
#kaya-convo .kaya-pitem .kaya-pi-note { color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#kaya-convo .kaya-pitem:hover { background:var(--bg3); }
#kaya-convo .kaya-pitem:hover .kaya-pi-ref { display:block; }
#kaya-convo .kaya-pitem:hover .kaya-pi-note { white-space:normal; overflow:visible; overflow-wrap:anywhere; }
#kaya-convo .kaya-pitem .kaya-pi-x { cursor:pointer; color:var(--muted); font-weight:700; }
#kaya-convo .kaya-composer { flex:0 0 auto; border-top:1px solid var(--line); padding:12px 14px 14px; background:var(--bg); }
#kaya-convo .kaya-composer textarea { display:block; width:100%; min-height:56px; max-height:170px; resize:vertical; padding:10px 11px; border:1px solid var(--line); border-radius:10px; background:#000; color:var(--ink); font-size:13px; outline:none; }
#kaya-convo .kaya-composer textarea:focus { border-color:var(--kt); }
#kaya-convo .kaya-send-row { display:flex; gap:8px; margin-top:10px; }
#kaya-convo .kaya-btn-primary { flex:1; height:39px; border:0; border-radius:10px; background:var(--kt); color:#fff; font-size:13px; font-weight:700; cursor:pointer; }
#kaya-convo .kaya-btn-primary:hover { background:#b34e35; }
#kaya-convo .kaya-btn-ghost { height:39px; padding:0 14px; border:1px solid var(--line); border-radius:10px; background:transparent; color:var(--muted); font-size:12.5px; font-weight:600; cursor:pointer; }
#kaya-convo .kaya-btn-ghost:hover { background:rgba(255,255,255,.05); color:var(--ink); }
#kaya-nav .kaya-nav-right { display:flex; align-items:center; gap:6px; }
#kaya-nav .kaya-menuwrap { position:relative; }
#kaya-nav .kaya-menubtn { display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; border:0; border-radius:9px; background:transparent; color:var(--muted); font-size:22px; line-height:1; cursor:pointer; }
#kaya-nav .kaya-menubtn:hover { background:rgba(255,255,255,.06); color:var(--ink); }
#kaya-nav .kaya-menu { position:absolute; top:calc(100% + 6px); right:0; min-width:216px; display:none; flex-direction:column; padding:6px; background:var(--bg); border:1px solid var(--line); border-radius:11px; box-shadow:0 16px 40px rgba(0,0,0,.55); }
#kaya-nav .kaya-menu.kaya-open { display:flex; }
#kaya-nav .kaya-menu-file { padding:7px 10px 8px; margin-bottom:4px; border-bottom:1px solid var(--line); font-size:11px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#kaya-nav .kaya-menu-item { display:block; width:100%; text-align:left; padding:8px 10px; border:0; border-radius:7px; background:transparent; color:var(--ink); font-size:13px; font-weight:500; cursor:pointer; }
#kaya-nav .kaya-menu-item:hover { background:rgba(255,255,255,.07); }
#kaya-nav .kaya-menu-danger { color:#e5766a; }
#kaya-nav .kaya-menu-danger:hover { background:rgba(229,118,106,.14); }
#kaya-convo .kaya-msg .kaya-who .kaya-round { margin-left:7px; padding:1px 7px; border-radius:999px; background:rgba(199,91,63,.18); color:var(--kt2); font-size:9px; letter-spacing:.06em; }
#kaya-convo .kaya-otherbanner { display:none; align-items:center; justify-content:space-between; gap:10px; margin:0 14px 10px; padding:9px 12px; border:1px solid rgba(224,176,98,.4); border-radius:9px; background:rgba(224,176,98,.1); color:#e0b062; font-size:12px; line-height:1.35; }
#kaya-convo .kaya-otherbanner.kaya-show { display:flex; }
#kaya-convo .kaya-otherbanner button { border:0; background:transparent; color:#e0b062; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap; text-decoration:underline; padding:0; }
`;
