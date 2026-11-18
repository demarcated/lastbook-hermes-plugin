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
const HARNESS = process.env.LB_HARNESS || require('path').join(__dirname, 'harness');
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
  const stripped = src.replace(/http:\/\/127\.0\.0\.1:8890/g, ''); // the two whitelisted placeholder strings
  const urls = stripped.match(/https?:\/\/[^\s'"`)]+/g) || [];
  ok(urls.length === 0, 'no http(s) URL literals outside whitelisted placeholders' + (urls.length ? ' — FOUND: ' + urls.slice(0, 3).join(' | ') : ''));
  ok(/hermesDesktop/.test(src) && /openExternal/.test(src), 'external opens use the sanctioned preload bridge');
  ok(/persist:hermes-lastbook/.test(src), 'embed uses the dedicated partition');
  ok(/data-lb/.test(src), 'injected <style> is tagged for teardown');
  ok(!/\/api\/(setup|update|chat)\b/.test(src), 'never calls /api/setup/*, /api/update/* or /api/chat');
  ok(/api\/assistant\/status/.test(src), 'the single call site is the status probe');
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
  '\n;globalThis.__LB__ = { isLoopback, normalizeUrl, splitKeyPaste, keyQuery, guideSrc, buildAskUrl, isConfiguredOrigin, patch, getState };')(injected);
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
ok(paneC && paneC.data?.placement === 'bottom' && paneC.data?.dock?.pane === 'workspace' && /px$/.test(paneC.data?.height || ''), 'pane contribution (bottom-docked workspace, px height)');
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

// ── no-url first run: setup card, no embed, hint strip ─────────────────────
const paneHost = document.createElement('div'); document.body.appendChild(paneHost);
const paneRoot = createRoot(paneHost);
act(() => paneRoot.render(paneC.render()));
ok(!paneHost.querySelector('webview'), 'no embed before a URL is configured');
const setupText = paneHost.querySelector('.lb-setup')?.textContent || '';
ok(setupText.includes('Already run Lastbook? paste its URL.'), 'setup line 1 (already run Lastbook)');
ok(setupText.includes('lastbook.org'), 'setup line 2 (official installer, no re-release)');
ok(setupText.includes('?key=') && setupText.includes('only on this machine'), 'setup line 3 (access link/key privacy)');
const hintEl = paneHost.querySelector('.lb-hint');
ok(hintEl && hintEl.textContent.includes('Closing this tab disables the plugin') && hintEl.textContent.includes('Reload desktop plugins'), 'close-pane quirk hint strip present');

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
ok(ctx.storageMap.get('lastbookKey') === 'ignored-on-loopback', 'key still stored (for when the URL changes)');
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
const navEv = new dom.window.Event('did-navigate'); navEv.url = 'http://192.0.2.20:8891/?key=example%20key#/ask';
act(() => wv2.dispatchEvent(navEv));
ok(chipHost.textContent.includes('◉ lastbook') && paneHost.querySelector('.lb-origin')?.textContent === 'http://192.0.2.20:8891', 'embed did-navigate → ◉ + meta row shows origin ONLY (honesty affordance)');

// webview popups: configured-origin → bridge; off-origin → dropped silently
const popEv = new dom.window.Event('new-window', { cancelable: true }); popEv.url = 'http://192.0.2.20:8891/#/read/x/2';
dom.window.hermesDesktop = { openExternal: async () => {} };
act(() => wv2.dispatchEvent(popEv));
ok(popEv.defaultPrevented, 'embed popup preventDefault (window-open policy is deny — we never pop windows)');
const badEv = new dom.window.Event('new-window', { cancelable: true }); badEv.url = 'http://evil.example/steal';
let offOriginOpened = false;
dom.window.hermesDesktop = { openExternal: async u => { offOriginOpened = !!u; } };
act(() => wv2.dispatchEvent(badEv));
ok(!offOriginOpened, 'off-origin embed popup dropped silently (isConfiguredOrigin choke point)');

// paste-with-key split
await click(buttonByText(paneHost, 'url'));
await setInput(setupInputs()[0], 'http://h.example:8891/?key=pasted99');
await setInput(setupInputs()[1], '');
mode = { kind: 'json', status: 200, body: { online: true } };
await click(buttonByText(paneHost, 'Save'));
ok(ctx.storageMap.get('lastbookUrl') === 'http://h.example:8891' && ctx.storageMap.get('lastbookKey') === 'pasted99', 'pasted access link auto-splits into origin + key');
ok(paneHost.querySelector('webview').getAttribute('src').startsWith('http://h.example:8891?key=pasted99#/ask'), 'split key rides the new embed src');

// ⟳ reload recreates the embed
const wv3 = paneHost.querySelector('webview');
await click(buttonByText(paneHost, '⟳ reload'));
const wv4 = paneHost.querySelector('webview');
ok(wv4 && wv4 !== wv3, '⟳ reload re-creates the embed element');

// chip + both palette rows reveal the pane
await click(chipHost.querySelector('button'));
await act(async () => { palOpen.data.run(); });
await act(async () => { palAsk.data.run(); });
ok(calls.revealPane.length === 3 && calls.revealPane.every(p => p === 'lastbook-guide:pane'), 'chip + palette rows revealPane("lastbook-guide:pane")');
await waitFor('ask input focused by palette', () => dom.window.document.activeElement === paneHost.querySelector('.lb-askbar input'));
ok(true, 'palette "ask the library" focuses the Ask bar');

// ── teardown ────────────────────────────────────────────────────────────────
act(() => { paneRoot.unmount(); chipRoot.unmount(); });
for (const d of ctx.disposers.splice(0)) d();
ok(!document.head.querySelector('style[data-lb="lastbook-guide"]'), 'glue <style> removed on dispose');
ok(ctx.intervals.every(t => t.cleared), 'ctx.setInterval probe timer cleared on dispose');
ok(!paneHost.querySelector('webview') && !document.querySelector('webview'), 'embed removed from DOM on unmount/dispose');

// ── Z · egress audit — every URL the plugin ever touched ───────────────────
{
  const allowed = ['http://127.0.0.1:8890/', 'http://192.0.2.20:8891/', 'http://h.example:8891/'];
  const rogue = fetchCalls.filter(c => !allowed.some(a => c.u.startsWith(a)));
  ok(fetchCalls.length > 0 && rogue.length === 0, 'ZERO-network contract: all ' + fetchCalls.length + ' egress calls on configured bases only');
  ok(fetchCalls.every(c => /\/api\/assistant\/status/.test(c.u)), 'every egress call is the status probe (nothing else ever hits the wire)');
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
console.log(failures ? `\nFAIL — ${failures} gate(s) red` : '\nPASS — all tier-1 scaffold gates green (G1–G4 + egress audit)');
process.exit(failures ? 1 : 0);
