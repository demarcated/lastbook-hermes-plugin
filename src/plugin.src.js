// ═══════════════════════════════════════════════════════════════════════════
// Lastbook · Survival Guide — Hermes desktop plugin (tier 1, single file)
// MIT License — Copyright (c) 2026 demarcated
//
// Talks ONLY to a Lastbook server the user runs or names: the URL + access
// key live in this plugin's own config store (ctx.storage), and every URL
// that reaches the network passes through originOf()/isConfiguredOrigin() —
// the single choke point. The one network call site is the best-effort
// /api/assistant/status status probe below (probe()); nothing functional
// depends on it — the embedded guide itself is the ground truth.
//
// All real interaction (reading, Ask, search, map) happens inside a
// <webview> of the user's own guide UI: it is the only first-party context
// that can ride the guide's HttpOnly session cookie after the ?key= →
// cookie gate, and the guide's own Ask UI keeps citations, stop button,
// chat history and model status. No custom chat calls are made here — the
// server's origin check would (rightly) refuse them from this context.
//
// External links use window.hermesDesktop.openExternal (the app's
// window-open policy denies popups); if the bridge is unavailable a
// copy-the-link strip appears instead. Quirk: closing this pane tab
// disables the plugin — the chip is the re-entry door and Ctrl+K →
// "Reload desktop plugins" restores it.
//
// Attribution: Lastbook is MIT-licensed offline survival software by the
// Lastbook contributors (© 2026, lastbook.org, github.com/Immortal-
// Protocols/lastbook). This plugin is an independent client: it bundles no
// Lastbook content and connects only to a Lastbook server the user runs or
// configures. Lastbook medical/survival content comes from Hesperian/WHO/
// Red Cross sources and is not clinically reviewed.
// ═══════════════════════════════════════════════════════════════════════════
import { cn, host, PALETTE_AREA, STATUSBAR_AREAS, Tip } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'lastbook-guide'
const PANE_ID = ID + ':pane'
const WEBVIEW_PARTITION = 'persist:hermes-lastbook'
const PROBE_EVERY_MS = 60000
const PROBE_TIMEOUT_MS = 4000

// ── shared live store (module scope: pane + chip read the same state) ──────
let st = {
  url: '', key: '', question: '',
  probe: 'off', modelOnline: null, probeDetail: '',
  hintSeen: 0, copyUrl: '', navOrigin: '', nonce: 0, focusSeq: 0
}
const subs = new Set()
const subscribe = f => { subs.add(f); return () => subs.delete(f) }
const getState = () => st
const patch = p => { st = { ...st, ...p }; for (const f of subs) f() }

let store = null          // ctx.storage (per-plugin config store; never the app's own browser stores)
let ctxRef = null         // plugin ctx, captured in register() for scoped timers
let timer = null          // the one 60s probe timer (ctx-scoped — dies with the plugin)
let inFlight = false
let askSeq = 0
let activeWebview = null  // live embed element while the pane is mounted
let askInputEl = null     // live Ask-bar input while the pane is mounted
let lastUnknownReload = 0

// ── URL + key helpers (normative, SPEC §3.2/§3.4/§3.5) ─────────────────────
const originOf = cand => { try { return new URL(String(cand)).origin } catch { return '' } }

const isLoopback = o => {
  try {
    let h = new URL(String(o)).hostname.toLowerCase()
    if (h.startsWith('[')) h = h.slice(1, -1) // IPv6 literals arrive bracketed
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.startsWith('127.')
  } catch { return false }
}

const normalizeUrl = raw => {
  const u = new URL(String(raw || '').trim())
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('http or https only')
  return u.origin
}

// paste-with-?key= handling: split an access link into origin + key (§3.8).
// Returns { origin, key } or { error }.
function splitKeyPaste (raw) {
  let v = String(raw || '').trim()
  if (!v) return { error: 'paste the URL your Lastbook guide shows' }
  let key = ''
  try {
    const u = new URL(v)
    const k = new URLSearchParams(u.search).get('key')
    if (k) { key = k; v = u.origin }
  } catch { /* let normalizeUrl produce the error message */ }
  try { return { origin: normalizeUrl(v), key } } catch (e) { return { error: String((e && e.message) || e) } }
}

// LAN key rides only to non-loopback bases — loopback servers are key-exempt
// by design; appending a key there would only trigger a 302 round-trip (§3.4).
const keyQuery = () => (st.key && st.url && !isLoopback(st.url) ? '?key=' + encodeURIComponent(st.key) : '')

// Canonical Ask deep link (external/browser form, no cache-buster):
//   base + [?key=…] + #/ask [?q=…]
const buildAskUrl = q => {
  const t = String(q == null ? '' : q).trim()
  return st.url ? st.url + keyQuery() + '#/ask' + (t ? '?q=' + encodeURIComponent(t) : '') : ''
}

// Embed src builder — same canonical shape; a private _r= counter is allowed
// on in-app sends so repeating the same question re-fires the SPA's
// hash-router auto-send (chat.js reads only q, ignores _r).
const guideSrc = (q, seq) => {
  if (!st.url) return ''
  const t = String(q == null ? '' : q).trim()
  if (!t) return st.url + keyQuery() + '#/ask'
  return st.url + keyQuery() + '#/ask?q=' + encodeURIComponent(t) + (seq ? '&_r=' + seq : '')
}

// THE choke point: every candidate URL leaving the plugin is checked here.
const isConfiguredOrigin = cand => !!st.url && originOf(cand) === st.url

// External open: the sanctioned preload bridge, copy-strip fallback (§3.5).
function openExt (u) {
  const hd = globalThis.window && globalThis.window.hermesDesktop
  if (hd && typeof hd.openExternal === 'function') {
    try { Promise.resolve(hd.openExternal(u)).catch(() => patch({ copyUrl: u })) }
    catch { patch({ copyUrl: u }) }
  } else {
    patch({ copyUrl: u })
  }
}

// ── health probe — THE single network call site (privacy invariant §4.1) ───
// Best-effort chrome only: never load-bearing. A cross-origin block and an
// unreachable server are indistinguishable from here, so a network throw is
// reported honestly as `unknown` and one webview reload per window asks the
// embed for ground truth (did-fail-load → offline; did-navigate → ok).
async function probe () {
  if (!st.url) { patch({ probe: 'off', modelOnline: null, probeDetail: '' }); return }
  try {
    const r = await fetch(st.url + '/api/assistant/status' + keyQuery(),
      { redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    if (r.status === 403) { patch({ probe: 'needs-key', modelOnline: null, probeDetail: 'server wants the access key' }); return }
    let modelOnline = null
    if (r.status === 200) { try { modelOnline = !!(await r.clone().json()).online } catch { /* non-JSON 200 */ } }
    patch({ probe: 'ok', modelOnline, probeDetail: 'HTTP ' + r.status })
  } catch {
    patch({ probe: 'unknown', modelOnline: null, probeDetail: 'blocked or offline' })
    if (activeWebview && typeof activeWebview.reload === 'function' && Date.now() - lastUnknownReload > PROBE_EVERY_MS) {
      lastUnknownReload = Date.now()
      try { activeWebview.reload() } catch { /* ground truth never load-bearing */ }
    }
  }
}

function probeTick () {
  if (inFlight || !st.url) return
  inFlight = true
  Promise.resolve(probe()).finally(() => { inFlight = false })
}

function ensureTimer () {
  if (timer || !ctxRef || !st.url) return
  timer = ctxRef.setInterval(probeTick, PROBE_EVERY_MS)
}
function clearTimer () {
  if (timer && ctxRef) {
    const c = ctxRef.clearInterval
    if (typeof c === 'function') c.call(ctxRef, timer)
    else if (typeof timer === 'function') timer()
  }
  timer = null
}

// ── pane ────────────────────────────────────────────────────────────────────
const PROBE_META = {
  ok:          ['st-ok',   s => '◉ connected' + (s.modelOnline === false ? ' · model off' : '')],
  'needs-key': ['st-key',  () => '⚿ key needed'],
  unknown:     ['st-bad',  () => '◌ unknown'],
  offline:     ['st-bad',  () => '○ offline'],
  off:         ['st-off',  () => '– not connected']
}
const CHIP_GLYPH = { ok: '◉', 'needs-key': '⚿', unknown: '◌', offline: '○', off: '–' }
const chipLabel = s => (CHIP_GLYPH[s.probe] || '–') + ' lastbook' +
  (s.probe === 'ok' && s.modelOnline === false ? ' · model off' : '')

function LastbookPane () {
  const wrapRef = useRef(null)
  const mountRef = useRef(null)
  const s = useSyncExternalStore(subscribe, getState)
  const [editing, setEditing] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [keyDraft, setKeyDraft] = useState('')
  const [err, setErr] = useState('')

  // Pane-mount geometry: plugin panes mount inside an
  // auto-height scroll wrapper, so %-heights collapse — pin the wrapper and
  // re-measure at 150 ms / 800 ms / on resize.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const fitPane = () => {
      const top = wrap.getBoundingClientRect().top
      wrap.style.height = Math.max(380, (globalThis.window?.innerHeight || 900) - top - 8) + 'px'
    }
    fitPane()
    const t1 = setTimeout(fitPane, 150)
    const t2 = setTimeout(fitPane, 800)
    const RO = globalThis.ResizeObserver
    const ro = RO ? new RO(fitPane) : null
    if (ro) ro.observe(wrap)
    const onResize = () => fitPane()
    globalThis.window?.addEventListener?.('resize', onResize)
    return () => {
      clearTimeout(t1); clearTimeout(t2)
      if (ro) ro.disconnect()
      globalThis.window?.removeEventListener?.('resize', onResize)
    }
  }, [])

  // Embed lifecycle: recreate the <webview> on url/key/reload changes.
  // src is assigned ONLY from guideSrc(); popups are denied and configured-
  // origin popups are handed to the system browser via openExt.
  useEffect(() => {
    const mount = mountRef.current
    if (!st.url || !mount) return
    const w = document.createElement('webview')
    w.setAttribute('partition', WEBVIEW_PARTITION)
    w.setAttribute('src', guideSrc(st.question))
    w.setAttribute('style', 'width:100%;flex:1 1 auto;min-height:340px;border:0;background:transparent')
    const onFail = ev => {
      if (ev && ev.errorCode === -3) return // aborted navigations are ours
      patch({ probe: 'offline', probeDetail: ((ev && ev.errorCode) != null ? ev.errorCode : '?') + ' ' + ((ev && ev.description) || '') })
    }
    const onNav = ev => {
      const o = originOf(ev && ev.url)
      patch({ navOrigin: o })
      if (o && o === st.url) patch({ probe: 'ok', probeDetail: 'guide loaded' })
    }
    const onWin = ev => {
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault()
      if (ev && isConfiguredOrigin(ev.url)) openExt(ev.url)
    }
    w.addEventListener('did-fail-load', onFail)
    w.addEventListener('did-navigate', onNav)
    w.addEventListener('new-window', onWin)
    mount.appendChild(w)
    activeWebview = w
    return () => {
      w.removeEventListener('did-fail-load', onFail)
      w.removeEventListener('did-navigate', onNav)
      w.removeEventListener('new-window', onWin)
      if (activeWebview === w) activeWebview = null
      if (w.parentNode) w.parentNode.removeChild(w)
    }
  }, [s.url, s.key, s.nonce])

  // Palette "ask the library" → focus the Ask bar after the pane reveals.
  useEffect(() => {
    if (!s.focusSeq) return
    const t = setTimeout(() => {
      if (askInputEl) { try { askInputEl.focus(); askInputEl.select && askInputEl.select() } catch { /* focus is best-effort */ } }
    }, 60)
    return () => clearTimeout(t)
  }, [s.focusSeq])

  const openEdit = () => {
    setUrlDraft(getState().url || '')
    setKeyDraft(getState().key || '')
    setErr('')
    setEditing(e => !e)
  }

  const save = (rawUrl, rawKey) => {
    const r = splitKeyPaste(rawUrl)
    if (r.error) { setErr(r.error); return }
    const key = String(rawKey || '').trim() || r.key || ''
    if (store) { store.set('lastbookUrl', r.origin); store.set('lastbookKey', key) }
    patch({ url: r.origin, key, navOrigin: '', probe: 'off', modelOnline: null, probeDetail: '', nonce: st.nonce + 1 })
    setEditing(false)
    probeTick()
    ensureTimer()
  }

  // In-app Ask: navigate the embed in place (hash-router auto-send), not a
  // full recreate — the guide keeps its own state. Repeating the same
  // question gets a fresh _r= counter so the hash still changes.
  const sendAsk = q => {
    const text = String(q == null ? getState().question : q).trim()
    patch({ question: text })
    if (activeWebview) {
      askSeq += 1
      try { activeWebview.setAttribute('src', guideSrc(text, askSeq)) } catch { /* embed will be recreated on next effect */ }
    }
  }

  const dismissHint = () => {
    if (store) store.set('hintSeen', 1)
    patch({ hintSeen: 1 })
  }

  const meta = PROBE_META[s.probe] || ['st-off', () => String(s.probe)]
  const showEditRow = !s.url || editing

  return jsx('div', { className: 'lb-wrap', ref: wrapRef, children: jsxs('div', { style: { display: 'flex', flexDirection: 'column', minHeight: 0, flex: '1 1 auto' }, children: [
    // 1 · meta row
    jsxs('div', { className: 'lb-meta', children: [
      jsx('span', { className: meta[0], children: meta[1](s) }),
      s.navOrigin && jsx('span', { className: 'lb-origin', children: s.navOrigin }),
      !!s.url && jsx('button', { type: 'button', className: 'lb-btn', onClick: openEdit, children: 'url' }),
      !!s.url && jsx('button', { type: 'button', className: 'lb-btn', onClick: () => openExt(buildAskUrl(getState().question)), children: '↗ browser' }),
      !!s.url && jsx('button', { type: 'button', className: 'lb-btn', onClick: () => patch({ nonce: st.nonce + 1 }), children: '⟳ reload' })
    ] }),

    // 2 · hint strip (close-pane quirk; first run until dismissed)
    s.hintSeen === 0 && jsxs('div', { className: 'lb-hint', children: [
      jsx('span', { style: { flex: '1 1 auto' }, children: 'Closing this tab disables the plugin. Bring it back with Ctrl+K → Reload desktop plugins, or click the lastbook chip.' }),
      jsx('button', { type: 'button', className: 'lb-btn', onClick: dismissHint, children: 'got it' })
    ] }),

    // copy-the-link fallback strip (only when the external-open bridge failed)
    s.copyUrl && jsxs('div', { className: 'lb-copy', children: [
      jsx('span', { children: 'open this link in your browser:' }),
      jsx('input', { readOnly: true, value: s.copyUrl, onFocus: e => { try { e.target.select() } catch { /* selection is a courtesy */ } } }),
      jsx('button', { type: 'button', className: 'lb-btn', onClick: () => {
        try { const c = globalThis.navigator && globalThis.navigator.clipboard; if (c && typeof c.writeText === 'function') Promise.resolve(c.writeText(getState().copyUrl)).catch(() => {}) } catch { /* the input stays user-selectable */ }
      }, children: 'Copy' }),
      jsx('button', { type: 'button', className: 'lb-btn', onClick: () => patch({ copyUrl: '' }), children: '✕' })
    ] }),

    // 3 · edit row (url + access key) — always present in the setup card,
    //     toggled by the url button once a server is set
    showEditRow && jsxs('div', { className: 'lb-setup', children: [
      !s.url && jsxs('div', { className: 'lb-setup-lines', children: [
        jsx('div', { children: 'Already run Lastbook? paste its URL.' }),
        jsx('div', { children: 'New here? Install Lastbook from lastbook.org, then copy the URL its guide shows (e.g. http://127.0.0.1:8890).' }),
        jsx('div', { children: 'Shared server? paste the access link including ?key= — we keep the key only on this machine.' })
      ] }),
      jsx('input', {
        type: 'text', className: 'lb-input', value: urlDraft,
        placeholder: 'http://127.0.0.1:8890 or your tailnet URL',
        onChange: e => { setUrlDraft(e.target.value); setErr('') }
      }),
      jsx('input', {
        type: 'password', className: 'lb-input', value: keyDraft,
        placeholder: 'access key (only if your server needs one)',
        onChange: e => setKeyDraft(e.target.value)
      }),
      err && jsx('div', { className: 'lb-err', children: err }),
      jsxs('div', { style: { display: 'flex', gap: '6px' }, children: [
        jsx('button', { type: 'button', className: 'lb-btn', onClick: () => save(urlDraft, keyDraft), children: 'Save' }),
        !!s.url && jsx('button', { type: 'button', className: 'lb-btn', onClick: () => setEditing(false), children: 'Cancel' })
      ] })
    ] }),

    // 4 · the embed (ground truth of reachability) — or nothing but the
    //     setup card until a URL is configured
    !!s.url && jsx('div', { className: 'lb-mount', ref: mountRef }),

    // 5 · Ask bar (empty question → plain #/ask)
    !!s.url && jsxs('div', { className: 'lb-askbar', children: [
      jsx('input', {
        type: 'text', className: 'lb-input', value: s.question,
        placeholder: 'ask the survival library — water, wounds, storms…',
        ref: el => { askInputEl = el },
        onChange: e => patch({ question: e.target.value }),
        onKeyDown: e => { if (e.key === 'Enter') sendAsk(e.target.value) }
      }),
      jsx('button', { type: 'button', className: 'lb-btn', onClick: () => sendAsk(), children: 'Ask' }),
      jsx('button', { type: 'button', className: 'lb-btn', onClick: () => openExt(buildAskUrl(getState().question)), children: '↗' })
    ] })
  ] }) })
}

// ── status-bar chip (the re-entry door while the pane quirk bites) ─────────
function LastbookChip () {
  const s = useSyncExternalStore(subscribe, getState)
  const stateWord = s.probe === 'ok' && s.modelOnline === false ? 'ok · model off' : s.probe
  return jsx(Tip, { label: 'Lastbook · Survival Guide — ' + stateWord, children:
    jsx('button', { type: 'button',
      className: cn('inline-flex h-full items-center gap-1 px-1.5 text-[0.6875rem]',
        'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'),
      onClick: () => host.revealPane(PANE_ID),
      children: jsx('span', { children: chipLabel(s) }) }) })
}

// ── styles (app theme vars only) ────────────────────
const CSS = [
  '.lb-wrap { display: flex; flex-direction: column; min-height: 420px; }',
  '.lb-wrap > div { min-height: 0; }',
  '.lb-meta { display: flex; align-items: baseline; gap: 10px; padding: 6px 10px; font-size: 11px;',
  '  letter-spacing: .1em; text-transform: uppercase; color: var(--ui-text-tertiary); flex: 0 0 auto; }',
  '.lb-meta .st-ok { color: #7ee8a2; }',
  '.lb-meta .st-key, .lb-meta .st-bad { color: #f4b450; }',
  '.lb-origin { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 38ch; }',
  '.lb-btn { color: #8fd0e8; background: rgba(74,170,195,.08); border: 1px solid rgba(74,170,195,.45);',
  '  border-radius: 14px; padding: 3px 12px; font-size: 11px; letter-spacing: .12em; cursor: pointer; }',
  '.lb-hint { display: flex; gap: 10px; align-items: center; margin: 0 10px 6px; padding: 8px 10px;',
  '  font-size: 12px; border: 1px dashed rgba(244,180,80,.5); border-radius: 8px;',
  '  color: var(--ui-text-secondary); flex: 0 0 auto; }',
  '.lb-setup { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; padding: 12px;',
  '  font-size: 12px; color: var(--ui-text-secondary); flex: 0 0 auto; }',
  '.lb-setup-lines { display: flex; flex-direction: column; gap: 4px; }',
  '.lb-input { width: 100%; font-size: 12px; padding: 4px 8px; border-radius: 6px;',
  '  border: 1px solid var(--ui-stroke-secondary); background: transparent; color: var(--ui-text-primary); }',
  '.lb-err { color: #f4b450; font-size: 12px; }',
  '.lb-mount { flex: 1 1 auto; min-height: 340px; display: flex; }',
  '.lb-askbar { display: flex; gap: 8px; padding: 8px 10px; flex: 0 0 auto;',
  '  border-top: 1px solid var(--ui-stroke-secondary); align-items: center; }',
  '.lb-askbar .lb-input { flex: 1 1 auto; }',
  '.lb-copy { display: flex; gap: 8px; align-items: center; margin: 0 10px 6px; padding: 8px 10px;',
  '  font-size: 12px; border: 1px solid var(--ui-stroke-secondary); border-radius: 8px; flex: 0 0 auto; }',
  '.lb-copy input { flex: 1 1 auto; font-size: 11px; padding: 3px 8px; border-radius: 6px;',
  '  border: 1px solid var(--ui-stroke-secondary); background: transparent; color: var(--ui-text-primary); }'
].join('\n')

// ── the plugin ──────────────────────────────────────────────────────────────
export default {
  id: ID,
  name: 'Lastbook · Survival Guide',
  description: 'Your offline survival library inside Hermes — guide panel, Ask deep-links, and access-key handling for any Lastbook server you run or point at.',
  defaultEnabled: true,
  register (ctx) {
    store = ctx.storage
    ctxRef = ctx

    patch({
      url: store.get('lastbookUrl', '') || '',
      key: store.get('lastbookKey', '') || '',
      hintSeen: Number(store.get('hintSeen', 0)) ? 1 : 0
    })

    const style = document.createElement('style')
    style.setAttribute('data-lb', ID)
    style.textContent = CSS
    document.head.appendChild(style)
    ctx.onDispose(() => style.remove())

    const paneHeight = Math.max(460, Math.min(780, Math.round(((globalThis.window?.innerHeight) || 900) * 0.66)))
    ctx.register({
      id: 'pane', area: 'panes', title: 'lastbook',
      data: { placement: 'bottom', dock: { pane: 'workspace', pos: 'bottom' }, height: paneHeight + 'px' },
      render: () => jsx(LastbookPane, {})
    })
    ctx.register({ id: 'chip', area: STATUSBAR_AREAS.right, order: 135, render: () => jsx(LastbookChip, {}) })
    ctx.register({
      id: 'open', area: PALETTE_AREA,
      data: {
        id: 'open', label: 'Lastbook: open survival guide',
        keywords: ['lastbook', 'survival', 'guide', 'first aid', 'offline', 'map'],
        run: () => host.revealPane(PANE_ID)
      }
    })
    ctx.register({
      id: 'ask', area: PALETTE_AREA,
      data: {
        id: 'ask', label: 'Lastbook: ask the library',
        keywords: ['lastbook', 'ask', 'survival', 'question'],
        run: () => { host.revealPane(PANE_ID); patch({ focusSeq: st.focusSeq + 1 }) }
      }
    })

    if (st.url) { probeTick(); ensureTimer() }

    ctx.onDispose(() => {
      clearTimer()
      if (activeWebview) {
        try { activeWebview.remove() } catch { /* already detached */ }
        activeWebview = null
      }
      askInputEl = null
      subs.clear()
    })
  }
}
