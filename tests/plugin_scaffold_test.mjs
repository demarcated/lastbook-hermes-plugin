#!/usr/bin/env node
/**
 * Lastbook · Survival Guide — tier 1 plugin scaffold acceptance test (G1–G4)
 * ============================================================================
 * Acceptance checks
 *
 *  G1 loader rules — only the 3 allowed import specifiers; no relative/
 *     dynamic imports; single file; folder == plugin id; exactly one
 *     default export; real hermes_cli.plugin_validate_desktop findings:
 *     none; node ESM parse; artifact bytes == src/plugin.src.js.
 *  G2 privacy static scan — exactly ONE network call site; banned-API list
 *     clean; every http(s) literal is a whitelisted placeholder; the
 *     sanctioned bridge/partition/data attrs are present.
 *  G3 jsdom lifecycle — register() contributes pane+chip+2 palette rows;
 *     styles injected with data-lb; no-url setup card; save url → embed
 *     mounts with canonical #/ask src (loopback key-exempt) + probe fires
 *     with the reading contract; Ask bar deep-links the embed; ↗ uses the
 *     openExternal bridge and falls back to the copy strip; tailnet save
 *     recreates the embed with ?key= before the fragment; probe tri-state
 *     drives the chip glyph (◉/⚿/◌ + webview ground-truth reload); chip +
 *     palette revealPane; dispose removes style/timers/embed.
 *  G4 deep-link/key unit table — normalizeUrl, splitKeyPaste, keyQuery
 *     loopback rule, guideSrc/buildAskUrl canonical shapes,
 *     isConfiguredOrigin rejection.
 *  Z  egress audit — every fetch URL captured across the whole session is
 *     on a configured base (zero-network contract, §4.1).
 *
 * Run: node tests/plugin_scaffold_test.mjs   (exit 0 = pass)
 * No network access: the only "server" is a scripted fetch spy.
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // plugin root
const PLUGIN = path.join(DIR, 'build', 'lastbook-guide', 'plugin.js');
const SRC = path.join(DIR, 'src', 'plugin.src.js');
// Test harness deps (jsdom, react, react-dom). Point LB_HARNESS at a dir containing
// node_modules with those three, or `npm i jsdom react react-dom` into ./tests/harness.
const HARNESS = process.env.LB_HARNESS || path.join(DIR, 'tests', 'harness');
const VALIDATOR = path.join(DIR, 'tests', 'validator_runner.py');

if (!existsSync(PLUGIN) || !existsSync(SRC)) {
  console.error('PENDING-BUILD: copy src/plugin.src.js to build/lastbook-guide/plugin.js first (byte-identical).');
  process.exit(2);
}

const require = createRequire(import.meta.url);
let failures = 0;
const ok = (cond, label) => { if (cond) console.log('✓ ' + label); else { failures++; console.error('✗ ' + label); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const src = readFileSync(PLUGIN, 'utf8');

// ── G1 · loader rules ───────────────────────────────────────────────────────
ok(path.basename(path.dirname(PLUGIN)) === 'lastbook-guide', 'folder name == plugin id (lastbook-guide)');
ok(readFileSync(SRC, 'utf8') === src, 'artifact is byte-identical to src/plugin.src.js (single source of truth)');
ok((src.match(/^export default\b/gm) || []).length === 1, 'exactly one default export');

const ALLOWED = new Set(['@hermes/plugin-sdk', 'react', 'react/jsx-runtime']);
const importRe = /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const imports = [...src.matchAll(importRe)].map(m => ({ names: m[1].split(',').map(s => s.trim()).filter(Boolean), spec: m[2] }));
ok(imports.length === 3 && imports.every(i => ALLOWED.has(i.spec)), 'imports ⊆ {@hermes/plugin-sdk, react, react/jsx-runtime}');
ok(!/^[ \t]*import[ \t]/m.test(src.replace(importRe, '')), 'no other import statements (relative imports refused)');
ok(!/import\s*\(/.test(src), 'no dynamic import()');

{
  const r = spawnSync('python3', [VALIDATOR, PLUGIN], { encoding: 'utf8' });
  let findings = null; try { findings = JSON.parse(r.stdout); } catch {}
  ok(Array.isArray(findings) && findings.length === 0, 'hermes plugin_validate_desktop findings: ' + (findings ? 'none' : 'VALIDATOR ERROR ' + (r.stderr || r.stdout).slice(0, 200)));
}
{
  const r = spawnSync(process.execPath, ['--input-type=module', '--check', '-'], { input: src, encoding: 'utf8' });
  ok(r.status === 0, 'node --check ESM parse' + (r.status ? ': ' + r.stderr.slice(0, 300) : ''));
}

// ── G2 · privacy static scan ────────────────────────────────────────────────
{
  ok((src.match(/\bfetch\s*\(/g) || []).length === 1, 'exactly ONE network call site (probe — privacy invariant §4.1)');
  const BANNED = ['WebSocket', 'EventSource', 'sendBeacon', 'geolocation', 'indexedDB',
    'localStorage', 'sessionStorage', 'new Function', 'window\\.open', '_blank', 'iframe',
    '\\beval\\b', 'document\\.createElement\\(\\s*[\'"]script'];
  const hits = BANNED.filter(p => new RegExp(p, 'i').test(src));
  ok(hits.length === 0, 'banned-API static scan clean' + (hits.length ? ' — HITS: ' + hits.join(', ') : ''));
  // Whitelisted literals: the v1.0.1 placeholder, the two UX-spec §9.1
  // allowlist constants (byte-exact-checked in G5), and the §7.1 prose
  // placeholder http://<host>:<port> (non-routable text, never fetched).
  let stripped = src.replace(/http:\/\/127\.0\.0\.1:8890/g, '').replace(/http:\/\/<host>:<port>/g, '')
  stripped = stripped.replace(/https:\/\/lastbook\.org\/download\//g, '')
  stripped = stripped.replace(/https:\/\/github\.com\/demarcated\/lastbook-hermes-plugin\/blob\/main\/docs\/SETUP\.md/g, '')
  const urls = stripped.match(/https?:\/\/[^\s'"`)]+/g) || [];
  ok(urls.length === 0, 'no http(s) URL literals outside whitelisted placeholders/allowlist constants' + (urls.length ? ' — FOUND: ' + urls.slice(0, 3).join(' | ') : ''));
  ok(/hermesDesktop/.test(src) && /openExternal/.test(src), 'external opens use the sanctioned preload bridge');
  ok(/persist:hermes-lastbook/.test(src), 'embed uses the dedicated partition');
  ok(/data-lb/.test(src), 'injected <style> is tagged for teardown');
  ok(!/\/api\/(setup|update|chat)\b/.test(src), 'never calls /api/setup/*, /api/update/* or /api/chat');
  ok(/api\/assistant\/status/.test(src), 'the single call site is the status probe');
}

// ── G5 · setup-assistant static compliance (UX spec §9.1/§12) ─────────────
{
  ok(src.includes("const LASTBOOK_DOWNLOAD_URL = 'https://lastbook.org/download/'"), 'G5 download constant byte-exact (versionless, §9.1)');
  ok(src.includes("const SETUP_DOCS_URL = 'https://github.com/demarcated/lastbook-hermes-plugin/blob/main/docs/SETUP.md'"), 'G5 docs constant byte-exact (pinned SETUP_DOCS_URL)');
  const allowConstants = [
    "const LASTBOOK_DOWNLOAD_URL = 'https://lastbook.org/download/'",
    "const SETUP_DOCS_URL = 'https://github.com/demarcated/lastbook-hermes-plugin/blob/main/docs/SETUP.md'"
  ];
  ok(allowConstants.every(c => !c.includes('key=')), 'G5 allowlist constants carry no key material');
  ok((src.match(/openExternal\s*\(/g) || []).length === 1, 'G5 exactly ONE openExternal( call site (inside openExt)');
  ok((src.match(/\bfetch\s*\(/g) || []).length === 1, 'G5 assistant added zero fetch sites (probe stays unique)');
  ok(!/Lastbook[-_][\d.]+|_Setup\.exe|-mac\.dmg|_amd64\.deb|downloads\.lastbook\.org/i.test(src), 'G5 no versioned installer URLs or binary filenames in code');
  ok(!/[0-9a-f]{64}/.test(src), 'G5 no digests embedded in plugin code (§9.4: dated build metadata is optional and shipped null)');
  // every real (non-placeholder) URL literal is one of the two constants
  const lit = src.replace(/http:\/\/127\.0\.0\.1:8890/g, '').replace(/http:\/\/<host>:<port>/g, '').match(/https?:\/\/[^\s'"`)]+/g) || [];
  ok(lit.length > 0 && lit.every(u => u === 'https://lastbook.org/download/' || u === 'https://github.com/demarcated/lastbook-hermes-plugin/blob/main/docs/SETUP.md'), 'G5 the only real URL literals are the two allowlist constants');
  // the download/docs buttons must be click-gated: every openExt call site is
  // either an onClick arrow or the configured-origin webview popup route.
  const openExtCalls = (src.match(/openExt\(/g) || []).length;
  const onClickOpens = (src.match(/onClick: \(\) => openExt\(/g) || []).length;
  ok(onClickOpens >= 4 && openExtCalls === onClickOpens + 1 && src.includes('isConfiguredOrigin(ev.url)) openExt(ev.url)'),
    'G5 openExt fires only from click handlers + the configured-origin popup route (no automatic opens)');
  ok(src.includes('BUILD_META = null'), 'G5 integrity line ships unpopulated (no undated/stale assertions possible)');
  ok(/disabled: mode === 'S5' \|\| !s\.url/.test(src) && src.includes("'checking…'"), 'G5 S5 checking… disabled label swap present (§4.4)');
  // display:none would stop did-navigate/did-fail-load (§3.4 ground-truth rule).
  // Scan the CSS rule strings only — prose comments legitimately mention the word.
  const cssText = (src.match(/'\.lb-[^']*'/g) || []).join(' ');
  ok(cssText.includes('.lb-mount-hidden') && /height: 0/.test(cssText) && !/display:\s*none/.test(cssText),
    'G5 S4 embed hidden via height-0 wrapper, never display:none (§3.4)');
}

// ── G3 · runtime harness (jsdom + real react/react-dom, scripted fetch) ────
const { JSDOM } = require(path.join(HARNESS, 'node_modules', 'jsdom'));
const React = require(path.join(HARNESS, 'node_modules', 'react'));
const JSXRuntime = require(path.join(HARNESS, 'node_modules', 'react', 'jsx-runtime'));
const { createRoot } = require(path.join(HARNESS, 'node_modules', 'react-dom', 'client'));
const { act } = React;

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom lacks `oninput` on document → react-dom falls into its legacy
// attachEvent input-polyfill path and throws on focus(); declare the prop.
if (!('oninput' in globalThis.document)) globalThis.document.oninput = null;

const roInstances = [];
globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; roInstances.push(this); } observe() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;

// scripted fetch spy — the ONLY egress recorder for the whole session
const fetchCalls = [];
let mode = { kind: 'json', status: 200, body: { online: true } };
globalThis.fetch = async (u, init) => {
  fetchCalls.push({ u: String(u), cache: init && init.cache, credentials: init && init.credentials, hasSignal: !!(init && init.signal) });
  if (mode.kind === 'throw') throw new TypeError('Failed to fetch');
  if (mode.kind === 'pending') return mode.response;
  const body = JSON.stringify(mode.body);
  return { status: mode.status, clone: () => ({ json: async () => JSON.parse(body) }) };
};

// SDK mock — exactly the surface the plugin imports
const calls = { revealPane: [] };
const SDK = {
  host: { revealPane: p => calls.revealPane.push(p) },
  PALETTE_AREA: 'palette',
  STATUSBAR_AREAS: { left: 'statusBar.left', right: 'statusBar.right' },
  Tip: props => props.children,
  cn: (...a) => a.filter(Boolean).join(' ')
};

const injected = { '@hermes/plugin-sdk': SDK, react: React, 'react/jsx-runtime': JSXRuntime };
const pre = imports.map(i => {
  const missing = i.names.filter(n => !(n in injected[i.spec]));
  ok(missing.length === 0, `imports from ${i.spec} all resolvable${missing.length ? ' — MISSING ' + missing : ''}`);
  return `const {${i.names.join(',')}} = __I[${JSON.stringify(i.spec)}];`;
}).join('\n');
const body = src.replace(importRe, '')
  .replace(/^export default\b/m, 'globalThis.__PLUGIN__ =');
new Function('__I', pre + '\n' + body +
  '\n;globalThis.__LB__ = { isLoopback, normalizeUrl, splitKeyPaste, keyQuery, guideSrc, buildAskUrl, isConfiguredOrigin, paneModeOf, osGuess, downloadLabel, patch, getState };')(injected);
const plugin = globalThis.__PLUGIN__;
const LB = globalThis.__LB__;

ok(plugin?.id === 'lastbook-guide' && typeof plugin.register === 'function', 'default export {id, name, description, defaultEnabled, register(ctx)}');
ok(plugin.defaultEnabled === true, 'defaultEnabled: true');
ok(plugin.name === 'Lastbook · Survival Guide', 'name is "Lastbook · Survival Guide"');

// ctx mock (scoped timers + per-plugin storage; timers never touch host setInterval)
const hostTimers = [];
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (fn, ms) => { const rec = { fn, ms, cleared: false, id: realSetInterval(fn, 1e9) }; hostTimers.push(rec); return rec.id; };
const ctx = (() => {
  const contributions = [], disposers = [], intervals = [], storageMap = new Map();
  return {
    contributions, disposers, intervals, storageMap,
    register: c => contributions.push(c),
    onDispose: fn => disposers.push(fn),
    setInterval: (fn, ms) => { const rec = { fn, ms, cleared: false }; intervals.push(rec); return rec; },
    clearInterval: rec => { if (rec) rec.cleared = true; },
    storage: { get: (k, fb) => storageMap.has(k) ? storageMap.get(k) : fb, set: (k, v) => storageMap.set(k, v), remove: k => storageMap.delete(k) }
  };
})();

plugin.register(ctx);

const paneC = ctx.contributions.find(c => c.area === 'panes');
const chipC = ctx.contributions.find(c => c.area === SDK.STATUSBAR_AREAS.right);
const palOpen = ctx.contributions.find(c => c.area === 'palette' && c.data?.id === 'open');
const palAsk = ctx.contributions.find(c => c.area === 'palette' && c.data?.id === 'ask');
ok(paneC && paneC.id === 'guide' && paneC.data?.placement === 'main' && paneC.data?.dock?.pane === 'workspace' && paneC.data?.dock?.pos === 'right' && paneC.data?.dock?.enforce === true && paneC.data?.width === '28rem' && paneC.data?.minWidth === '22rem', 'pane contribution (right-docked workspace track, enforce, 28rem/min 22rem)');
ok(paneC?.title === 'lastbook', 'pane title "lastbook"');
ok(chipC && chipC.render && chipC.order === 135, 'status-bar chip contribution (order 135)');
ok(palOpen?.data?.label === 'Lastbook: open survival guide' && typeof palOpen?.data?.run === 'function', 'palette row "Lastbook: open survival guide"');
ok(palAsk?.data?.label === 'Lastbook: ask the library' && typeof palAsk?.data?.run === 'function', 'palette row "Lastbook: ask the library"');
ok(document.head.querySelector('style[data-lb="lastbook-guide"]'), 'styles injected with data-lb tag');
ok(ctx.intervals.length === 0, 'no probe timer before a URL exists');

async function waitFor(desc, cond, ms = 4000) {
  const t0 = Date.now();
  for (;;) {
    if (await cond()) return;
    if (Date.now() - t0 > ms) throw new Error('timeout: ' + desc);
    await act(async () => { await sleep(15); });
  }
}
// React 19 + jsdom on this host never routes dispatched input/change events
// into onChange (delegation quirk — click dispatch works). Call the fiber
// props directly: deterministic, exercises the same handler the app calls.
const reactProps = el => el[Object.keys(el).find(k => k.startsWith('__reactProps$'))];
const setInput = async (el, v) => {
  await act(async () => {
    el.value = v;
    const p = reactProps(el);
    if (!p || typeof p.onChange !== 'function') throw new Error('no React onChange prop on input');
    p.onChange({ target: el, currentTarget: el });
  });
};
const click = async el => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const buttonByText = (root, text) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text);

// ── no-url first run: S0 setup assistant, no embed, hint strip ─────────────
const paneHost = document.createElement('div'); document.body.appendChild(paneHost);
const paneRoot = createRoot(paneHost);
act(() => paneRoot.render(paneC.render()));
ok(!paneHost.querySelector('webview'), 'no embed before a URL is configured');
const assist0 = paneHost.querySelector('.lb-assist');
ok(!!assist0 && assist0.textContent.includes('get set up with lastbook'), 'S0 first-run assistant header (§4.2)');
const s0titles = [...paneHost.querySelectorAll('.lb-step-title')].map(el => el.textContent.trim());
ok(s0titles.length === 4 && s0titles[0].startsWith('1. install lastbook') && s0titles[1].startsWith('2. open lastbook') &&
  s0titles[2].startsWith('3. paste the url') && s0titles[3].startsWith('4. check again'), 'S0 four numbered steps, verbatim titles (§4.2)');
ok(assist0.textContent.includes('Opens lastbook.org in your browser') && assist0.textContent.includes('SmartScreen/Gatekeeper prompts') &&
  assist0.textContent.includes('this plugin only opens the official link'), 'S0 caption states browser-driven download + user-driven OS prompts (§4.2/§9.2)');
ok(assist0.textContent.includes('the key stays on this machine'), 'S0 step 3 keeps the key-privacy line (§4.2)');
ok(!!assist0.querySelector('.lb-setup') && assist0.querySelectorAll('.lb-setup input').length === 2, 'S0 embeds the reused edit row inside step 3 (§5)');
ok(!!paneHost.querySelector('.lb-setup input[placeholder="http://127.0.0.1:8890 or your tailnet URL"]') &&
  !!paneHost.querySelector('.lb-setup input[placeholder="access key (only if your server needs one)"]'), 'S0 reuses the v1.0.1 inputs verbatim (placeholders unchanged)');
ok(!![...paneHost.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('⤓ download Lastbook')), 'S0 OS-aware download button present (§4.6)');
ok(!!buttonByText(paneHost, 'full setup guide ↗') && !buttonByText(paneHost, 'not now') && !buttonByText(paneHost, 'advanced'), 'S0 links row: docs link only (no dismiss/advanced before config)');
ok(!paneHost.querySelector('.lb-askbar'), 'no Ask bar while the assistant is up (§5)');
const hintEl = paneHost.querySelector('.lb-hint');
ok(hintEl && hintEl.textContent.includes('Closing this tab disables the plugin') && hintEl.textContent.includes('Reload desktop plugins'), 'close-pane quirk hint strip present (independent of assistant)');

// hint dismissal persists
const chipHost = document.createElement('div'); document.body.appendChild(chipHost);
const chipRoot = createRoot(chipHost);
act(() => chipRoot.render(chipC.render()));
ok(chipHost.textContent.includes('– lastbook'), 'chip shows – (no url) before setup');
await click(buttonByText(paneHost, 'got it'));
ok(ctx.storageMap.get('hintSeen') === 1 && !paneHost.querySelector('.lb-hint'), 'hint dismissal stores hintSeen=1 and removes strip');

// invalid url → inline error, nothing saved
await setInput(paneHost.querySelectorAll('.lb-setup input')[0], 'not a url');
await click(buttonByText(paneHost, 'Save'));
ok(!!paneHost.querySelector('.lb-err') && !ctx.storageMap.get('lastbookUrl'), 'unparseable URL → inline error, nothing saved, no embed');

// ── same-machine server: loopback, key-exempt ──────────────────────────────
mode = { kind: 'json', status: 200, body: { online: true } };
const setupInputs = () => [...paneHost.querySelectorAll('.lb-setup input')];
await setInput(setupInputs()[0], 'http://127.0.0.1:8890/');   // trailing slash → origin-only store
await setInput(setupInputs()[1], 'ignored-on-loopback');
await click(buttonByText(paneHost, 'Save'));
ok(ctx.storageMap.get('lastbookUrl') === 'http://127.0.0.1:8890', 'save normalizes to origin only (trailing slash dropped)');
const wv1 = paneHost.querySelector('webview');
ok(!!wv1 && wv1.getAttribute('partition') === 'persist:hermes-lastbook', 'embed mounts with dedicated partition');
ok(wv1.getAttribute('src') === 'http://127.0.0.1:8890#/ask', 'embed src is canonical base#/ask (default Ask view)');
ok(!wv1.getAttribute('src').includes('?key='), 'loopback is key-exempt — no ?key= on loopback embed');
ok(ctx.storageMap.get('lastbookKey') === 'ignored-on-loopback', 'key is stored for the configured origin');
const p1 = fetchCalls.find(c => c.u === 'http://127.0.0.1:8890/api/assistant/status');
ok(!!p1, 'single probe fired at /api/assistant/status on save');
ok(p1 && p1.cache === 'no-store' && p1.credentials === 'omit' && p1.hasSignal, 'probe uses cache:no-store + credentials:omit + AbortSignal (reading contract)');
ok(ctx.intervals.some(t => t.ms === 60000) && hostTimers.length === 0, '60s probe timer armed on ctx.setInterval only (no host timer)');
await waitFor('chip ok', () => chipHost.textContent.includes('◉ lastbook'));
ok(true, 'chip → ◉ after probe 200 {online:true}');

// probe JSON online:false mirrors into model state
mode = { kind: 'json', status: 200, body: { online: false } };
ctx.intervals.find(t => t.ms === 60000).fn(); // manual tick (real 60s would block the test)
await waitFor('chip model off', () => chipHost.textContent.includes('model off'));
ok(true, 'chip mirrors modelOnline:false from probe JSON');
mode = { kind: 'json', status: 200, body: { online: true } };

// ── Ask bar deep-links the embed in place ──────────────────────────────────
const askInput = paneHost.querySelector('.lb-askbar input');
ok(!!askInput, 'Ask bar present with configured url');
await setInput(askInput, 'stop the bleed');
await click(buttonByText(paneHost, 'Ask'));
const src1 = paneHost.querySelector('webview').getAttribute('src');
ok(src1 === 'http://127.0.0.1:8890#/ask?q=stop%20the%20bleed&_r=1', 'Ask rewrites embed src to #/ask?q=<encoded> (repeat-safe _r counter)');
ok(paneHost.querySelector('webview') === wv1, 'in-app Ask navigates in place (embed not recreated)');
await setInput(askInput, '   ');
await click(buttonByText(paneHost, 'Ask'));
ok(paneHost.querySelector('webview').getAttribute('src') === 'http://127.0.0.1:8890#/ask', 'empty question → plain #/ask');

// ── ↗ browser: bridge, then copy fallback ──────────────────────────────────
await setInput(paneHost.querySelector('.lb-askbar input'), 'purify water');
let external = null;
dom.window.hermesDesktop = { openExternal: async u => { external = u; } };
await click(buttonByText(paneHost, '↗ browser'));
await waitFor('bridge open', () => external === 'http://127.0.0.1:8890#/ask?q=purify%20water');
ok(true, '↗ browser routes canonical deep link through hermesDesktop.openExternal (no popup APIs)');
delete dom.window.hermesDesktop;
await click(buttonByText(paneHost, '↗ browser'));
const copyEl = paneHost.querySelector('.lb-copy input');
ok(copyEl && copyEl.value === 'http://127.0.0.1:8890#/ask?q=purify%20water' && buttonByText(paneHost, 'Copy'), 'bridge missing → copy strip with full deep link + Copy');
await click(buttonByText(paneHost, '✕'));
ok(!paneHost.querySelector('.lb-copy'), 'copy strip dismissible');

// ── tailnet server: key rides before the fragment; embed recreates ────────
await click(buttonByText(paneHost, 'url'));
await setInput(setupInputs()[0], 'http://192.0.2.20:8891/extra/path?x=1');
await setInput(setupInputs()[1], 'example key');
mode = { kind: 'json', status: 403, body: { denied: true } };
await click(buttonByText(paneHost, 'Save'));
ok(ctx.storageMap.get('lastbookUrl') === 'http://192.0.2.20:8891', 'tailnet URL stored origin-only (path+query dropped)');
const wv2 = paneHost.querySelector('webview');
ok(!!wv2 && wv2 !== wv1 && !wv1.parentNode, 'url change recreates the embed (old element detached)');
ok(wv2.getAttribute('src').startsWith('http://192.0.2.20:8891?key=example%20key#/ask'), 'non-loopback embed carries ?key= BEFORE the #/ask fragment (302-preserving gate)');
ok(fetchCalls.some(c => c.u === 'http://192.0.2.20:8891/api/assistant/status?key=example%20key'), 'probe also carries ?key= on non-loopback');
await waitFor('chip needs-key', () => chipHost.textContent.includes('⚿ lastbook'));
ok(true, 'probe 403 → chip ⚿ needs-key');

mode = { kind: 'throw' };
wv2.reload = () => { wv2.__reloaded = (wv2.__reloaded || 0) + 1; };
ctx.intervals.find(t => t.ms === 60000).fn();
await waitFor('chip unknown', () => chipHost.textContent.includes('◌ lastbook'));
ok(true, 'probe network throw → honest ◌ unknown (CORS-vs-offline not asserted)');
await waitFor('ground-truth reload', () => wv2.__reloaded === 1);
ok(true, 'unknown triggers ONE webview ground-truth reload per window (offline detection path)');

// webview ground truth: did-fail-load → ○ offline; did-navigate → ◉ + origin
const failEv = new dom.window.Event('did-fail-load'); failEv.errorCode = -102; failEv.description = 'CONNECTION_REFUSED';
act(() => wv2.dispatchEvent(failEv));
ok(chipHost.textContent.includes('○ lastbook'), 'embed did-fail-load → chip ○ offline (ground truth over probe)');
const wvHidden = paneHost.querySelector('.lb-mount.lb-mount-hidden webview');
ok(!!wvHidden && wvHidden === wv2, 'assistant keeps the webview mounted at height-0, never display:none (§3.4)');
const navEv = new dom.window.Event('did-navigate'); navEv.url = 'http://192.0.2.20:8891/?key=example%20key#/ask';
act(() => wv2.dispatchEvent(navEv));
ok(chipHost.textContent.includes('◉ lastbook') && paneHost.querySelector('.lb-origin')?.textContent === 'http://192.0.2.20:8891', 'embed did-navigate → ◉ + meta row shows origin ONLY (honesty affordance)');
const wv2b = paneHost.querySelector('webview');
ok(!!wv2b && wv2b !== wv2 && !paneHost.querySelector('.lb-mount-hidden'), 'T-RS did-navigate heal bumps nonce → embed re-mounted fresh (§10.2)');
ok(!paneHost.querySelector('.lb-assist') && !!paneHost.querySelector('.lb-askbar'), 'webview ground-truth heal dismisses the assistant and restores the Ask bar');

// webview popups: configured-origin → bridge; off-origin → dropped silently
const popEv = new dom.window.Event('new-window', { cancelable: true }); popEv.url = 'http://192.0.2.20:8891/#/read/x/2';
dom.window.hermesDesktop = { openExternal: async () => {} };
act(() => wv2b.dispatchEvent(popEv));
ok(popEv.defaultPrevented, 'embed popup preventDefault (window-open policy is deny — we never pop windows)');
const badEv = new dom.window.Event('new-window', { cancelable: true }); badEv.url = 'http://evil.example/steal';
let offOriginOpened = false;
dom.window.hermesDesktop = { openExternal: async u => { offOriginOpened = !!u; } };
act(() => wv2b.dispatchEvent(badEv));
ok(!offOriginOpened, 'off-origin embed popup dropped silently (isConfiguredOrigin choke point)');

// Switch servers while a copy fallback is visible and earlier requests are still pending.
await setInput(paneHost.querySelector('.lb-askbar input'), 'previous private draft');
delete dom.window.hermesDesktop;
await click(buttonByText(paneHost, '↗ browser'));
ok(!!paneHost.querySelector('.lb-copy input'), 'old server has a visible copy link before switch');
let rejectOpen;
dom.window.hermesDesktop = { openExternal: () => new Promise((resolve, reject) => { rejectOpen = reject; }) };
await click(buttonByText(paneHost, '↗ browser'));
let finishProbe;
mode = { kind: 'pending', response: new Promise(resolve => { finishProbe = resolve; }) };
ctx.intervals.find(t => t.ms === 60000).fn();
const beforeSwitch = fetchCalls.length;
await click(buttonByText(paneHost, 'url'));
await setInput(setupInputs()[0], 'http://h.example:8891/?key=pasted99');
mode = { kind: 'json', status: 200, body: { online: true } };
await click(buttonByText(paneHost, 'Save'));
ok(ctx.storageMap.get('lastbookUrl') === 'http://h.example:8891' && ctx.storageMap.get('lastbookKey') === 'pasted99', 'pasted access link auto-splits into origin + key');
ok(paneHost.querySelector('webview').getAttribute('src') === 'http://h.example:8891?key=pasted99#/ask', 'new embed uses only the pasted key and opens without a question');
ok(fetchCalls.slice(beforeSwitch).every(c => c.u === 'http://h.example:8891/api/assistant/status?key=pasted99') && fetchCalls.length > beforeSwitch, 'new probe starts immediately with the new key');
ok(paneHost.querySelector('.lb-askbar input').value === '' && !paneHost.querySelector('.lb-copy input'), 'switch clears the previous Ask draft and copy link');
await act(async () => {
  rejectOpen(new Error('old browser request failed'));
  finishProbe({ status: 403 });
});
ok(!paneHost.querySelector('.lb-copy input') && chipHost.textContent.includes('◉ lastbook'), 'late callbacks cannot restore a previous link or status');

// A path-only edit keeps this origin's key and question. A pasted key rotates it.
await setInput(paneHost.querySelector('.lb-askbar input'), 'same server question');
await click(buttonByText(paneHost, 'url'));
await setInput(setupInputs()[0], 'http://h.example:8891/guide');
await click(buttonByText(paneHost, 'Save'));
ok(ctx.storageMap.get('lastbookKey') === 'pasted99' && paneHost.querySelector('.lb-askbar input').value === 'same server question', 'same-origin edit keeps its saved key and question');
await click(buttonByText(paneHost, 'url'));
await setInput(setupInputs()[0], 'http://h.example:8891/?key=rotated-test-key');
await click(buttonByText(paneHost, 'Save'));
ok(ctx.storageMap.get('lastbookKey') === 'rotated-test-key', 'a pasted access link rotates the key on the same origin');

// A bare new origin never inherits an existing key, including an edited key draft.
await click(buttonByText(paneHost, 'url'));
await setInput(setupInputs()[1], 'unsaved-old-key');
await setInput(setupInputs()[0], 'https://spare.example');
ok(setupInputs()[1].value === '', 'changing origins clears the old password field');
await click(buttonByText(paneHost, 'Save'));
ok(ctx.storageMap.get('lastbookKey') === '' && paneHost.querySelector('webview').getAttribute('src') === 'https://spare.example#/ask', 'bare URL stores an empty key and opens without the previous question');
ok(fetchCalls.at(-1).u === 'https://spare.example/api/assistant/status', 'bare new origin receives a keyless status request');
await click(buttonByText(paneHost, 'url'));
await setInput(setupInputs()[0], 'http://h.example:8891');
await setInput(setupInputs()[1], 'explicit-test-key');
await click(buttonByText(paneHost, 'Save'));
ok(ctx.storageMap.get('lastbookKey') === 'explicit-test-key', 'can explicitly enter a key for a new origin');
await click(buttonByText(paneHost, 'url'));
await setInput(setupInputs()[1], '');
await click(buttonByText(paneHost, 'Save'));
ok(ctx.storageMap.get('lastbookKey') === '', 'can explicitly clear a saved key on the same origin');
await click(buttonByText(paneHost, 'url'));
await setInput(setupInputs()[0], 'http://h.example:8891/?key=unused-test-key');
await setInput(setupInputs()[1], '');
await click(buttonByText(paneHost, 'Save'));
ok(ctx.storageMap.get('lastbookKey') === '' && !paneHost.querySelector('webview').getAttribute('src').includes('?key=') &&
  !fetchCalls.at(-1).u.includes('?key='), 'clearing a key suggested by a pasted URL omits it from storage, the embed and the probe');

// ⟳ reload recreates the embed
const wv3 = paneHost.querySelector('webview');
await click(buttonByText(paneHost, '⟳ reload'));
const wv4 = paneHost.querySelector('webview');
ok(wv4 && wv4 !== wv3, '⟳ reload re-creates the embed element');

// chip + both palette rows reveal the pane
await click(chipHost.querySelector('button'));
await act(async () => { palOpen.data.run(); });
await act(async () => { palAsk.data.run(); });
ok(calls.revealPane.length === 3 && calls.revealPane.every(p => p === 'lastbook-guide:guide'), 'chip + palette rows revealPane("lastbook-guide:guide")');
await waitFor('ask input focused by palette', () => dom.window.document.activeElement === paneHost.querySelector('.lb-askbar input'));
ok(true, 'palette "ask the library" focuses the Ask bar');

// ══ G6/G7/G8 · setup assistant (UX spec §12 gates) ════════════════════════
let opens = [];
{
  // ── G6 · probe failure → assistant; dismiss/re-entry; retry-probe T6/T-RS ─
  mode = { kind: 'throw' };
  await click(buttonByText(paneHost, 'url'));
  await setInput(setupInputs()[0], 'http://h.example:8891');
  await click(buttonByText(paneHost, 'Save'));
  await waitFor('S4 assistant', () => !!paneHost.querySelector('.lb-assist'));
  const a4 = paneHost.querySelector('.lb-assist');
  ok(a4.textContent.includes("your shared server isn't answering"), "G6 non-loopback S4 title (§4.3)");
  ok(a4.textContent.includes('Nothing replied at') && a4.textContent.includes('http://h.example:8891') &&
    a4.textContent.includes('this pane only talks to that server'), 'G6 S4 sub-line names the configured URL honestly (§0 principle 1)');
  const t4 = [...paneHost.querySelectorAll('.lb-step-title')].map(el => el.textContent.trim());
  ok(t4.length === 4 && t4[0].startsWith('1. wake the server') && t4[1].startsWith('2. confirm the link') &&
    t4[2].startsWith('3. paste the access link') && t4[3].startsWith('4. check again'), 'G6 S4 four steps (§4.3)');
  ok(a4.textContent.includes('python server.py --port 8890 --lan'), 'G6 wake-the-server step mentions the guide command (§4.3)');
  ok(!!a4.querySelector('.lb-setup input'), 'G6 S4 embeds the reused edit row (§5)');
  ok(a4.textContent.includes('or run your own server on this computer →'), 'G6 secondary own-server link (§4.3)');
  const mount4 = paneHost.querySelector('.lb-mount');
  ok(mount4 && mount4.classList.contains('lb-mount-hidden') && !!mount4.querySelector('webview'), 'G6 S4 embed mounted at height-0 (§3.4)');
  ok(!paneHost.querySelector('.lb-askbar') && !buttonByText(paneHost, '↗ browser'), 'G6 S4 hides Ask bar + browser button (§5)');
  ok(!!buttonByText(paneHost, 'advanced') && !!buttonByText(paneHost, 'full setup guide ↗') && !!buttonByText(paneHost, 'not now'), 'G6 S4 links row complete (§4.1)');

  await click(buttonByText(paneHost, 'not now'));
  ok(!paneHost.querySelector('.lb-assist') && !!paneHost.querySelector('.lb-mount') &&
    !paneHost.querySelector('.lb-mount').classList.contains('lb-mount-hidden') && !!paneHost.querySelector('.lb-askbar'),
    'G6 not now → S1 legacy plain pane, embed visible again (T8)');
  const setupBtn = buttonByText(paneHost, 'setup');
  ok(!!setupBtn, 'G6 S1 carries the setup re-entry button (§5)');
  await click(setupBtn);
  ok(!!paneHost.querySelector('.lb-assist'), 'G6 setup → S4 returns (T9)');

  // advanced overlay (S8) is inline text, no network
  await click(buttonByText(paneHost, 'advanced'));
  const advEl = paneHost.querySelector('.lb-adv');
  ok(!!advEl && advEl.textContent.includes('Running the guide headless') && advEl.textContent.includes('derived/lan-key') &&
    advEl.textContent.includes('the download page shows current checksums.') && advEl.textContent.includes('independent client'),
    'G6 advanced panel: headless path + dated-integrity fallback + attribution, all inline (§7)');
  await click(buttonByText(paneHost, 'hide details'));
  ok(!paneHost.querySelector('.lb-adv'), 'G6 advanced collapses back');

  const g6wvPre = paneHost.querySelector('webview');
  let finishRetry;
  mode = { kind: 'pending', response: new Promise(res => { finishRetry = res; }) };
  const beforeRetry = fetchCalls.length;
  await click(buttonByText(paneHost, '⟳ retry check'));
  ok(!!buttonByText(paneHost, 'checking…') && buttonByText(paneHost, 'checking…').disabled, 'G6 retry → S5 checking… disabled, same slot (§4.4)');
  ok(!!paneHost.querySelector('.lb-assist'), 'G6 S5 keeps the steps');
  ok(paneHost.querySelector('.lb-diag') && paneHost.querySelector('.lb-diag').textContent.includes('still nothing — last check'), 'G6 S5 keeps previous diagnostics until the new result lands (§4.4)');
  ok(fetchCalls.length === beforeRetry + 1 && fetchCalls.at(-1).u === 'http://h.example:8891/api/assistant/status', 'G6 retry-probe reuses the single fetch site against the CONFIGURED url/key (§6.1)');
  await act(async () => { finishRetry({ status: 200, clone: () => ({ json: async () => ({ online: true }) }) }); });
  await waitFor('S2 connected', () => chipHost.textContent.includes('◉ lastbook'));
  ok(!paneHost.querySelector('.lb-assist') && !!paneHost.querySelector('.lb-askbar'), 'G6 T-RS → S2, assistant gone, Ask restored');
  const g6wvPost = paneHost.querySelector('webview');
  ok(g6wvPost && g6wvPost !== g6wvPre && !paneHost.querySelector('.lb-mount-hidden'), 'G6 T-RS bumped nonce → embed re-mounted (remount pitfall §10.2)');

  // ── G6b · loopback branch copy + failure diagnostics (T-RF) ───────────────
  mode = { kind: 'throw' };
  await click(buttonByText(paneHost, 'url'));
  await setInput(setupInputs()[0], 'http://127.0.0.1:8890');
  await click(buttonByText(paneHost, 'Save'));
  await waitFor('S4 loopback', () => !!paneHost.querySelector('.lb-assist'));
  const a4b = paneHost.querySelector('.lb-assist');
  ok(a4b.textContent.includes("lastbook isn't answering"), 'G6b loopback S4 title (§4.2)');
  ok(a4b.textContent.includes("Usually Lastbook just isn't open on this computer") &&
    a4b.textContent.includes('a blocked port can look the same from here'), 'G6b loopback sub-line stays honest about CORS-vs-dead (§0 principle 1)');
  ok(a4b.textContent.includes('Open Lastbook and let it load'), 'G6b loopback step 2');
  const b4u = fetchCalls.at(-1).u;
  ok(b4u === 'http://127.0.0.1:8890/api/assistant/status', 'G6b loopback probe key-exempt even after assistant (loopback rule kept)');
  let finishFail;
  mode = { kind: 'pending', response: new Promise((_, rej) => { finishFail = rej; }) };
  await click(buttonByText(paneHost, '⟳ retry check'));
  ok(!!buttonByText(paneHost, 'checking…'), 'G6b retry → S5');
  await act(async () => { try { await Promise.reject(new TypeError('Failed to fetch')); } catch { /* expected */ } finishFail(new TypeError('Failed to fetch')); });
  await waitFor('back to S4', () => { const b = buttonByText(paneHost, '⟳ retry check'); return !!b && !b.disabled; });
  const diag = paneHost.querySelector('.lb-diag');
  ok(!!diag && /still nothing — last check \d{2}:\d{2}:\d{2}, blocked or offline/.test(diag.textContent),
    'G6b T-RF → S4 with timestamped diagnostics carrying the honest raw cause (§6.3)');

  // ── G8 · OS-aware labels + external opens (same constant) ────────────────
  dom.window.hermesDesktop = { openExternal: async u => { opens.push(String(u)); } };
  const setUA = ua => Object.defineProperty(dom.window.navigator, 'userAgent', { value: ua, configurable: true });
  const dlBtnOf = () => [...paneHost.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('⤓ download Lastbook'));
  const uaCases = [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', '⤓ download Lastbook for Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', '⤓ download Lastbook for macOS'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', '⤓ download Lastbook'],
    ['HermesDesktop/1.0', '⤓ download Lastbook']
  ];
  for (const [ua, label] of uaCases) {
    setUA(ua);
    // Any assistant re-render re-evaluates the label; toggling advanced is
    // the user-visible way to force one without touching private state.
    await click(buttonByText(paneHost, 'advanced') || buttonByText(paneHost, 'hide details'));
    const b = dlBtnOf();
    ok(!!b && b.textContent.trim() === label, 'G8 UA → ' + label + ' (§4.6)');
    if (ua.includes('Macintosh')) ok(paneHost.querySelector('.lb-assist').textContent.includes('Apple Silicon (M1+) on macOS 14 or newer'), 'G8 macOS caption addendum (§4.6)');
    await click(b);
  }
  await waitFor('four external opens', () => opens.length === 4);
  ok(opens.every(u => u === 'https://lastbook.org/download/'), 'G8 every OS branch opens the single versionless constant (§9.1)');
  await click(buttonByText(paneHost, 'full setup guide ↗'));
  await waitFor('docs open', () => opens.length === 5);
  ok(opens[4] === 'https://github.com/demarcated/lastbook-hermes-plugin/blob/main/docs/SETUP.md', 'G8 docs button opens the pinned SETUP_DOCS_URL byte-exact');
  delete dom.window.hermesDesktop;
  await click(dlBtnOf());
  const copyDl = paneHost.querySelector('.lb-copy input');
  ok(copyDl && copyDl.value === 'https://lastbook.org/download/' && !copyDl.value.includes('key='),
    'G8 bridge-missing copy strip shows the allowlist link, no key material (§9.5/T11)');
  await click(buttonByText(paneHost, '✕'));
  setUA('Mozilla/5.0 (linux) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/31.0.1');
}

// ── G7 · needs-key: compact S3 banner, NOT the assistant ────────────────────
{
  mode = { kind: 'json', status: 403, body: { denied: true } };
  ctx.intervals.find(t => t.ms === 60000).fn();   // background tick (no retry button in S2)
  await waitFor('S3 banner', () => !!paneHost.querySelector('.lb-keybanner'));
  ok(chipHost.textContent.includes('⚿ lastbook'), 'G7 403 → ⚿ needs-key chip');
  ok(!paneHost.querySelector('.lb-assist'), 'G7 needs-key does NOT trigger the assistant (locked decision 2)');
  const mount3 = paneHost.querySelector('.lb-mount');
  ok(!!mount3.querySelector('webview') && !mount3.classList.contains('lb-mount-hidden'), 'G7 embed stays fully visible — the 403 deny page is authoritative (§3.2)');
  const banner = paneHost.querySelector('.lb-keybanner');
  ok(banner.textContent.includes('the server is up but wants an access key') && banner.textContent.includes('it stays on this machine'), 'G7 banner copy verbatim (§4.5)');
  ok(!!buttonByText(paneHost, 'paste key'), 'G7 empty-key variant offers paste key');
  await click(buttonByText(paneHost, 'paste key'));
  await waitFor('key input focused', () => dom.window.document.activeElement === paneHost.querySelectorAll('.lb-setup input')[1]);
  ok(true, 'G7 paste key opens the reused edit row focused on the key input (§4.5)');
  await setInput(paneHost.querySelectorAll('.lb-setup input')[1], 'g7-test-key');
  mode = { kind: 'json', status: 200, body: { online: true } };
  await click(buttonByText(paneHost, 'Save'));
  ok(ctx.storageMap.get('lastbookKey') === 'g7-test-key' && !paneHost.querySelector('.lb-keybanner'), 'G7 key Save routes through the existing key-clearing save path (§5)');
  // key already present → stale-key wording + update key
  mode = { kind: 'json', status: 403, body: { denied: true } };
  ctx.intervals.find(t => t.ms === 60000).fn();
  await waitFor('update key', () => !!buttonByText(paneHost, 'update key'));
  ok(paneHost.querySelector('.lb-keybanner').textContent.includes('may be stale or belong to a different server'), 'G7 saved-key variant states the key may be stale (§4.5)');
  mode = { kind: 'json', status: 200, body: { online: true } };
  ctx.intervals.find(t => t.ms === 60000).fn();
  await waitFor('chip ok again', () => chipHost.textContent.includes('◉ lastbook'));
  ok(true, 'G7 needs-key → ok heals the banner away (background tick, L7 parity)');
}

// ── teardown ────────────────────────────────────────────────────────────────
act(() => { paneRoot.unmount(); chipRoot.unmount(); });
for (const d of ctx.disposers.splice(0)) d();
ok(!document.head.querySelector('style[data-lb="lastbook-guide"]'), 'glue <style> removed on dispose');
ok(ctx.intervals.every(t => t.cleared), 'ctx.setInterval probe timer cleared on dispose');
ok(!paneHost.querySelector('webview') && !document.querySelector('webview'), 'embed removed from DOM on unmount/dispose');

// ── Z · egress audit — every URL the plugin ever touched ───────────────────
{
  const allowed = ['http://127.0.0.1:8890/', 'http://192.0.2.20:8891/', 'http://h.example:8891/', 'https://spare.example/'];
  const rogue = fetchCalls.filter(c => !allowed.some(a => c.u.startsWith(a)));
  ok(fetchCalls.length > 0 && rogue.length === 0, 'ZERO-network contract: all ' + fetchCalls.length + ' egress calls on configured bases only');
  ok(fetchCalls.every(c => /\/api\/assistant\/status/.test(c.u)), 'every egress call is the status probe (nothing else ever hits the wire)');
  ok(fetchCalls.every(c => !/lastbook\.org|github\.com/i.test(c.u)), 'Z assistant NEVER fetches the allowlist hosts — openExternal-only (L9 static mirror)');
  ok(opens.length === 5 && opens.slice(0, 4).every(u => u === 'https://lastbook.org/download/') &&
    opens[4] === 'https://github.com/demarcated/lastbook-hermes-plugin/blob/main/docs/SETUP.md',
    'Z every assistant-driven external open is one of the two allowlist constants, nothing else opened');
}

// ── G4 · deep-link + key unit table (pure functions from module scope) ─────
{
  LB.patch({ url: '', key: '', probe: 'off' });
  ok(LB.normalizeUrl(' http://127.0.0.1:8890/') === 'http://127.0.0.1:8890', 'G4 normalizeUrl trims + drops trailing slash');
  ok(LB.normalizeUrl('https://a.b:8443/x/y?a=1#frag') === 'https://a.b:8443', 'G4 normalizeUrl → origin only (path/query/fragment dropped)');
  let threw = false; try { LB.normalizeUrl('ftp://x/y') } catch { threw = true }
  ok(threw, 'G4 normalizeUrl rejects non-http(s)');
  threw = false; try { LB.normalizeUrl('garbage') } catch { threw = true }
  ok(threw, 'G4 normalizeUrl rejects unparseable');

  ok(LB.isLoopback('http://localhost:8890') && LB.isLoopback('http://127.0.0.1:8890') && LB.isLoopback('http://127.5.5.5:1') && LB.isLoopback('http://[::1]:8890'), 'G4 isLoopback localhost/127.*/[::1]');
  ok(!LB.isLoopback('http://192.0.2.20:8891') && !LB.isLoopback('nope'), 'G4 isLoopback rejects tailnet + garbage');

  let r = LB.splitKeyPaste('http://h:8891/?key=abc123');
  ok(r.origin === 'http://h:8891' && r.key === 'abc123', 'G4 paste-with-key splits into origin + key');
  r = LB.splitKeyPaste('http://h:8891/path');
  ok(r.origin === 'http://h:8891' && r.key === '', 'G4 plain URL splits with empty key');
  r = LB.splitKeyPaste('');
  ok(!!r.error, 'G4 empty paste → error (not saved)');

  LB.patch({ url: 'http://127.0.0.1:8890', key: 'k k' });
  ok(LB.keyQuery() === '', 'G4 loopback never carries ?key= (server key-exempt)');
  LB.patch({ url: 'http://192.0.2.20:8891', key: 'k k' });
  ok(LB.keyQuery() === '?key=k%20k', 'G4 non-loopback key query encoded, before fragment by construction');
  LB.patch({ key: '' });
  ok(LB.keyQuery() === '', 'G4 no key → no query');
  LB.patch({ key: 'KK' });
  ok(LB.guideSrc('water the') === 'http://192.0.2.20:8891?key=KK#/ask?q=water%20the', 'G4 guideSrc canonical shape (key before fragment)');
  ok(LB.guideSrc('water the', 9) === 'http://192.0.2.20:8891?key=KK#/ask?q=water%20the&_r=9', 'G4 guideSrc repeat-send counter appended after q');
  ok(LB.guideSrc('') === 'http://192.0.2.20:8891?key=KK#/ask', 'G4 empty question → plain #/ask');
  ok(LB.buildAskUrl('a b') === 'http://192.0.2.20:8891?key=KK#/ask?q=a%20b', 'G4 buildAskUrl canonical external form (no cache-buster)');
  ok(LB.buildAskUrl('') === 'http://192.0.2.20:8891?key=KK#/ask', 'G4 buildAskUrl empty question');
  LB.patch({ url: '', key: '' });
  ok(LB.buildAskUrl('x') === '' && LB.guideSrc('x') === '', 'G4 no url → no deep link at all');

  LB.patch({ url: 'http://192.0.2.20:8891', key: '' });
  ok(LB.isConfiguredOrigin('http://192.0.2.20:8891/whatever#/read'), 'G4 isConfiguredOrigin accepts same-origin');
  ok(!LB.isConfiguredOrigin('http://evil.example/'), 'G4 isConfiguredOrigin rejects off-origin');
  ok(!LB.isConfiguredOrigin('http://192.0.2.20:8891.evil.example/'), 'G4 isConfiguredOrigin rejects suffix-spoof origin');
  ok(!LB.isConfiguredOrigin('javascript:alert(1)') && !LB.isConfiguredOrigin('relative/path') && !LB.isConfiguredOrigin(''), 'G4 isConfiguredOrigin rejects javascript:/relative/empty');
  LB.patch({ url: '', key: '' });
  ok(!LB.isConfiguredOrigin('http://192.0.2.20:8891/'), 'G4 unconfigured plugin accepts NOTHING');
}

globalThis.setInterval = realSetInterval;
console.log(failures ? `\nFAIL — ${failures} gate(s) red` : '\nPASS — all gates green (G1 validator · G2 privacy · G3 runtime · G4 deep-link/key table · G5 setup-assistant · G6 state machine · G7 needs-key · G8 OS labels · Z egress)');
process.exit(failures ? 1 : 0);
