# KAYA Editor Phase 1 build report

Date: 2026-08-08
Branch: `kaya-phase1`

## Completed

- Vendored pinned assets in `kaya-editor/vendor/`:
  - DaisyUI `5.5.19`: `daisyui.css`, `themes.css`
  - Tailwind browser runtime `4.2.4`: `tailwind/index.global.js`
  - Mermaid `11.15.0`: `mermaid/mermaid.min.js`
- Export now replaces known CDN stylesheet/script references with the vendored DaisyUI and Tailwind bytes, keeps local asset inlining, removes remote resource attributes, and does not inline system fonts.
- Export renders Mermaid source through the pinned Mermaid runtime in a temporary Chrome/Chromium page, embeds the resulting real SVG, and omits the 3.3 MB Mermaid runtime from the saved artifact. A typical vendor fixture export is below 2 MB.
- Served Mermaid containers receive the pinned Mermaid runtime and initialization script for real browser rendering.
- Overlay chrome now reads `Multimode · Kaya` and retains terracotta `#c75b3f`.
- Corrected export tests to require DaisyUI and Tailwind signatures, real SVG structure, no external resource attributes, no system font data, and a sub-2 MB result.
- Added executable `verify/checks/kaya-editor.sh` for AC1 through AC7. It exercises the HTTP server, poll protocol, export, Mermaid, brand, package metadata, and vendor files.

## Verification run

- `npm run build`: passed.
- `npm test`: passed, 18 test files and 101 tests.
- `npx vitest run kaya-editor/test/kaya.test.js`: passed, 5 tests, including a real Mermaid SVG export and the served runtime marker.
- `./verify/checks/kaya-editor.sh`: passed: AC1 through AC7 PASS, AC8 SKIP.
- `mm spec verify specs/kaya-editor.md`: final run reported executable checks `7 PASS, 0 FAIL, 1 SKIP`; the verifier reported all AC1 through AC7 proven and AC8 intentionally runtime-only.
- CLI export smoke: passed. A real `kaya export` produced a 1,291,269-byte file with DaisyUI, Tailwind, and Mermaid SVG present. Chrome headless was launched with `MAP * 0.0.0.0`; its dumped DOM still contained the page heading and SVG. This proves the no-network DOM path, not human visual fidelity.

The current shell is Node `v20.19.0`. KAYA declares Node `>=22` and `.nvmrc` is `22`; a Node 22 execution run remains pending.

## Browser verification status

The following are intentionally not claimed as complete because they require a human using a real browser:

1. Overlay UX: run `nvm use 22`, then `node kaya-editor/bin/kaya.js /absolute/path/demo.html`. Click an element, select text, queue two prompts, and run `kaya poll /absolute/path/demo.html --agent-reply "Agent is ready"`. Confirm both annotations, selector context, conversation reply, and `kaya end` behavior.
2. Faithful offline visual rendering: export with `kaya export /absolute/path/demo.html --out /tmp/demo.offline.html`, disable network in browser DevTools, open the exported file directly, reload, and visually confirm Tailwind/DaisyUI layout, local assets, fonts, and Mermaid diagrams. The automated no-network DOM smoke is covered by the manifest; human visual fidelity is still UNVERIFIED.
3. AC8 A/B: run one real `mm spec new <name> --kaya` flow and one identical flow without `--kaya`. Annotate, poll, revise, end, and compare the resulting exports. AC8 remains UNVERIFIED and is SKIP in the manifest.

## Known limitations and open questions

- Exporting an artifact containing Mermaid requires Chrome or Chromium at export time. Set `KAYA_BROWSER` to an executable path when auto-detection does not find one.
- Local artifact-declared fonts are inlined through their CSS URLs but are not subsetted yet. Whole system fonts are no longer copied into exports.
- The full Mermaid runtime is vendored for served-page rendering but intentionally omitted from exports after SVG pre-rendering to meet the 2 MB target.
- Cloudflare sharing, whiteboard editing, and layout-warning detection remain outside Phase 1.
- The unrelated verify-parser changes already present in `package.json`, `src/verify/runner.ts`, and `test/verify/runner.test.ts` were left untouched by the KAYA work.

No commit, push, or pull request was made. No `lavish-axi` source was read or installed.
