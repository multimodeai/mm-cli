export const KAYA_PREFIX = '/__kaya';
export const DEFAULT_PORT = 41731;
export const POLL_TIMEOUT_MS = 30 * 60 * 1000;

export const OVERLAY_STYLE = `
#kaya-overlay, #kaya-overlay * { font-family: "Kaya Sans", ui-sans-serif, system-ui, sans-serif; }
#kaya-overlay { position: fixed; z-index: 2147483647; right: 18px; bottom: 18px; width: min(380px, calc(100vw - 36px)); color: #2f2622; }
#kaya-overlay .kaya-card { overflow: hidden; border: 1px solid #e8c6b8; border-radius: 14px; background: #fffaf4f5; box-shadow: 0 12px 32px #3d1e1433; backdrop-filter: blur(12px); }
#kaya-overlay .kaya-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; color: white; background: #c75b3f; }
#kaya-overlay .kaya-brand { font-size: 13px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
#kaya-overlay .kaya-status { font-size: 11px; opacity: .9; }
#kaya-overlay .kaya-body { padding: 12px; }
#kaya-overlay .kaya-reply { max-height: 108px; margin-bottom: 10px; padding: 9px 10px; overflow: auto; border-left: 3px solid #c75b3f; border-radius: 6px; background: #fff; white-space: pre-wrap; font-size: 12px; line-height: 1.45; }
#kaya-overlay .kaya-context { margin-bottom: 8px; color: #7b5a4d; font-size: 11px; }
#kaya-overlay textarea { display: block; width: 100%; min-height: 64px; resize: vertical; padding: 9px; border: 1px solid #dfb5a5; border-radius: 7px; background: #fff; color: #2f2622; outline-color: #c75b3f; }
#kaya-overlay select { width: 100%; margin-top: 7px; padding: 7px; border: 1px solid #dfb5a5; border-radius: 7px; background: #fff; color: #2f2622; }
#kaya-overlay .kaya-actions { display: flex; gap: 7px; margin-top: 8px; }
#kaya-overlay button { flex: 1; padding: 8px 9px; border: 0; border-radius: 7px; color: #fff; background: #a9432f; font-size: 12px; font-weight: 650; }
#kaya-overlay button:hover { background: #8f3828; }
#kaya-overlay button.kaya-secondary { color: #8f3828; background: #f3d9cf; }
#kaya-overlay button.kaya-secondary:hover { background: #e9c2b4; }
#kaya-overlay .kaya-queue { margin-top: 9px; color: #7b5a4d; font-size: 11px; }
#kaya-overlay .kaya-hint { margin-top: 8px; color: #8f6b5b; font-size: 11px; line-height: 1.35; }
`;
