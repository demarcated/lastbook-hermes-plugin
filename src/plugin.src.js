// ═══════════════════════════════════════════════════════════════════════════
// Lastbook · Survival Guide — Hermes desktop plugin (tier 1, single file)
// MIT License — Copyright (c) 2026 demarcated
// v1.1.0 (2026-11-20, t_3cfa9a1e): tier-3 setup assistant per
// docs/SETUP-ASSISTANT-UX-SPEC-v1.md (states S0–S8, retry-probe, guided
// first-run). v1.0.1 right-dock build superseded.
//
// Talks ONLY to a Lastbook server the user runs or names: the URL + access
// key live in this plugin's own config store (ctx.storage), and every URL
// that reaches the network passes through originOf()/isConfiguredOrigin() —
// the single choke point. The one network call site is the best-effort
// /api/assistant/status status probe below (probeTick()); nothing functional
// depends on it — the embedded guide itself is the ground truth.
//
// All real interaction (reading, Ask, search, map) happens inside a
// <webview> of the user's own guide UI: it is the only first-party context
// that can ride the guide's HttpOnly session cookie after the ?key= →
// cookie gate, and the guide's own Ask UI keeps citations, stop button,
// chat history and model status. No custom chat calls are made here — the
// server's origin check would (rightly) refuse them from this context.
//
// When nothing answers the configured URL the pane shows a setup assistant
// (steps + the same reused URL/key edit row + retry check) instead of a
// dead embed. The assistant is a door, not an installer: it never downloads,
// verifies, mirrors or executes any Lastbook binary or content; the official
// installer lives only at lastbook.org and opens in the system browser via
// the sanctioned preload bridge. Two constants are the ONLY non-configured
// URLs in this file and they leave only through the openExt helper inside
// click handlers (UX spec §9.1, parent SPEC amendment A1).
//
// External links use the sanctioned preload bridge window.hermesDesktop —
// the app's
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
const PANE_ID = ID + ':guide'   // v1.0.1: id bumped from ':pane' — fresh layout state so the right-dock hint applies
const WEBVIEW_PARTITION = 'persist:hermes-lastbook'
const PROBE_EVERY_MS = 60000
const PROBE_TIMEOUT_MS = 4000

// ── setup assistant allowlist (UX spec §9.1 / SPEC amendment A1) ───────────
// Closed set: EXACTLY these two literals may leave the plugin through
// openExternal, and only inside onClick handlers (never automatically,
// never through the probe, never into the webview). The download target is
// versionless and permanent on purpose — versioned installer URLs rot
// within days (upstream rotates releases; verified 2026-11-20) and this
// plugin must never pretend to know which build is current.
const LASTBOOK_DOWNLOAD_URL = 'https://lastbook.org/download/'
const SETUP_DOCS_URL = 'https://github.com/demarcated/lastbook-hermes-plugin/blob/main/docs/SETUP.md'

// Optional build-time integrity metadata (UX spec §7.2/§9.4). A build may
// fill this from the official SHA256SUMS registry with its as_of date; the
// assistant drops the line automatically after 30 days (a dated wrong fact
// is acceptable, an undated stale fact is not). Shipped null: this plugin
// never fetches or verifies anything, and asserts no signing facts —
// upstream publishes none (t_97401c9e, 2026-11-20).
const BUILD_META = null // e.g. { version: 'X.Y.Z', asOf: 'YYYY-MM-DD', windowsSha256: '<registry hex>' }

// ── shared live store (module scope: pane + chip read the same state) ──────
// The four assistant fields at the end are in-memory ONLY (UX spec §2):
// nothing user-derived is persisted beyond the three ctx.storage keys
// v1.0.1 already writes.
let st = {
  url: '', key: '', question: '',
  probe: 'off', modelOnline: null, probeDetail: '',
  hintSeen: 0, copyUrl: '', navOrigin: '', nonce: 0, focusSeq: 0,
  probeInFlight: false, lastCheck: 0, dismissed: false, advancedOpen: false
}
const subs = new Set()
const subscribe = f => { subs.add(f); return () => subs.delete(f) }
const getState = () => st
const patch = p => { st = { ...st, ...p }; for (const f of subs) f() }

let store = null          // ctx.storage (per-plugin config store; never the app's own browser stores)
let ctxRef = null         // plugin ctx, captured in register() for scoped timers
let timer = null          // the one 60s probe timer (ctx-scoped — dies with the plugin)
let configVersion = 0     // invalidate work started under an earlier server configuration
let probeVersion = null   // at most one pending probe per configuration
let askSeq = 0
let activeWebview = null  // live embed element while the pane is mounted
let askInputEl = null     // live Ask-bar input while the pane is mounted
let keyInputEl = null     // live key input while the edit row is mounted
let lastUnknownReload = 0
let focusTarget = ''      // which input the next focusSeq bump should focus ('' → ask, 'key' → key field)

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
// hash-router auto-send (chat.js reads only q, ignores _r). The assistant
// never assigns this: guide pages render here, docs pages never do.
const guideSrc = (q, seq) => {
  if (!st.url) return ''
  const t = String(q == null ? '' : q).trim()
  if (!t) return st.url + keyQuery() + '#/ask'
  return st.url + keyQuery() + '#/ask?q=' + encodeURIComponent(t) + (seq ? '&_r=' + seq : '')
}

// THE choke point: every candidate URL leaving the plugin is checked here.
// (The two allowlist constants bypass it by design — they only reach the
// system browser through openExt inside click handlers, never the network.)
const isConfiguredOrigin = cand => !!st.url && originOf(cand) === st.url

// External open: the sanctioned preload bridge, copy-strip fallback (§3.5).
// The single openExternal call site (static gate G5).
function openExt (u) {
  const version = configVersion
  const showCopyLink = () => {
    if (version === configVersion) patch({ copyUrl: u })
  }
  const hd = globalThis.window && globalThis.window.hermesDesktop
  if (hd && typeof hd.openExternal === 'function') {
    try { Promise.resolve(hd.openExternal(u)).catch(showCopyLink) }
    catch { showCopyLink() }
  } else {
    showCopyLink()
  }
}

// ── health probe — THE single network call site (privacy invariant §4.1) ───
// Best-effort chrome only: never load-bearing. A cross-origin block and an
// unreachable server are indistinguishable from here, so a network throw is
// reported honestly as `unknown` and one webview reload per window asks the
// embed for ground truth (did-fail-load → offline; did-navigate → ok).
// `userInitiated` (the assistant's ⟳ retry check) is the ONLY thing that
// renders the S5 checking… button; background 60s ticks stay silent (§6.1).
async function probeTick (userInitiated) {
  const version = configVersion
  if (!st.url || probeVersion === version) return
  probeVersion = version
  if (userInitiated) patch({ probeInFlight: true })
  try {
    const r = await fetch(st.url + '/api/assistant/status' + keyQuery(),
      { redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    if (version !== configVersion) return
    if (r.status === 403) {
      patch({ probe: 'needs-key', modelOnline: null, probeDetail: 'server wants the access key', probeInFlight: false, lastCheck: Date.now() })
      return
    }
    let modelOnline = null
    if (r.status === 200) { try { modelOnline = !!(await r.clone().json()).online } catch { /* non-JSON 200 */ } }
    if (version === configVersion) {
      const cur = getState()
      // T-RS remount pitfall (UX spec §10.2): leaving the assistant must bump
      // nonce or the height-0 embed would be un-hidden still showing its old
      // failed load. Same rule for the webview did-navigate heal below.
      const heal = !cur.dismissed && (cur.probe === 'unknown' || cur.probe === 'offline')
      patch({ probe: 'ok', modelOnline, probeDetail: 'HTTP ' + r.status, probeInFlight: false, lastCheck: Date.now(),
        ...(heal ? { nonce: st.nonce + 1 } : {}) })
    }
  } catch {
    if (version !== configVersion) return
    patch({ probe: 'unknown', modelOnline: null, probeDetail: 'blocked or offline', probeInFlight: false, lastCheck: Date.now() })
    if (activeWebview && typeof activeWebview.reload === 'function' && Date.now() - lastUnknownReload > PROBE_EVERY_MS) {
      lastUnknownReload = Date.now()
      try { activeWebview.reload() } catch { /* ground truth never load-bearing */ }
    }
  } finally {
    if (probeVersion === version) probeVersion = null
  }
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

// ── derived pane mode (UX spec §2 — single pure function; modes S0–S5, with
//    the advanced panel S8 as an overlay on S4/S5) ───────────────────────────
function paneModeOf (s) {
  if (!s.url) return 'S0'
  if (s.dismissed) return 'S1'
  if (s.probe === 'unknown' || s.probe === 'offline') return s.probeInFlight ? 'S5' : 'S4'
  if (s.probe === 'needs-key') return 'S3'
  return 'S2'
}

// ── assistant chrome helpers (label-only OS guess, honest diagnostics) ─────
// Detection affects the download BUTTON LABEL only; every branch opens the
// same single constant (§9.1). The plugin cannot see installs and never
// claims it can — the network is never probed for "is it installed".
function osGuess () {
  try {
    const navs = [globalThis.window && globalThis.window.navigator, globalThis.navigator]
    for (const nav of navs) {
      if (!nav) continue
      const ud = nav.userAgentData
      const p = ud && typeof ud.platform === 'string' ? ud.platform : ''
      if (/win/i.test(p)) return 'windows'
      if (/mac/i.test(p)) return 'macos'
      if (/linux/i.test(p)) return 'linux'
      const ua = typeof nav.userAgent === 'string' ? nav.userAgent : ''
      if (/Windows NT/.test(ua)) return 'windows'
      if (/Macintosh/.test(ua)) return 'macos'
      if (/X11|Linux/.test(ua)) return 'linux'
    }
  } catch { /* label only, never load-bearing */ }
  return 'unknown'
}
const downloadLabel = () => {
  const os = osGuess()
  if (os === 'windows') return '⤓ download Lastbook for Windows'
  if (os === 'macos') return '⤓ download Lastbook for macOS'
  return '⤓ download Lastbook'
}

// Local-clock-only timestamp for the diagnostics line (§6.3) — no network.
const fmtTime = ms => {
  if (!ms) return 'never'
  const d = new Date(ms)
  const p = n => String(n).padStart(2, '0')
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
}

// Integrity line (§7.2/§9.4): dated + attributed text or the honest
// fallback. Never a signing claim — upstream publishes no Authenticode
// metadata and Apple notarization is only a page claim.
function integrityLine () {
  try {
    if (BUILD_META && BUILD_META.version && BUILD_META.asOf && BUILD_META.windowsSha256) {
      const asOf = Date.parse(BUILD_META.asOf)
      const age = Date.now() - asOf
      if (Number.isFinite(asOf) && age >= 0 && age <= 30 * 86400000) {
        return 'current build: Lastbook ' + BUILD_META.version + ' — SHA-256 ' + BUILD_META.windowsSha256.slice(0, 8) +
          '… (as published on lastbook.org on ' + BUILD_META.asOf + '). Check it after downloading: certutil -hashfile <file> SHA256 (Windows) or shasum -a 256 <file> (macOS).'
      }
    }
  } catch { /* dated facts only; anything suspect is omitted */ }
  return 'the download page shows current checksums.'
}

// ── pane ────────────────────────────────────────────────────────────────────
const PROBE_META = {
  ok:          ['st-ok',   s => '◉ connected' + (s.modelOnline === false ? ' · model off' : '')],
  'needs-key': ['st-key',  () => '⚿ key needed'],
  unknown:     ['st-bad',  () => '◌ blocked or offline'],   // A2: honest pill copy (CORS-vs-dead is indistinguishable from here)
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
  const [keyDraft, setKeyDraft] = useState(null)
  const [err, setErr] = useState('')
  const draft = splitKeyPaste(urlDraft)
  const suggestedKey = draft.key || (draft.origin === s.url ? s.key : '')

  const mode = paneModeOf(s)
  const assistantMode = mode === 'S4' || mode === 'S5'   // assistant shown over a hidden embed
  const assistantActive = assistantMode || mode === 'S0' // assistant in charge of the body
  const loopBranch = !s.url || isLoopback(s.url)

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
  // origin popups are handed to the system browser via openExt. The element
  // stays mounted while the assistant is up (§3.4 height-0 wrapper, NOT
  // display:none) so did-navigate/did-fail-load keep firing as ground truth.
  useEffect(() => {
    const mount = mountRef.current
    if (!st.url || !mount) return
    const version = configVersion
    const w = document.createElement('webview')
    w.setAttribute('partition', WEBVIEW_PARTITION)
    w.setAttribute('src', guideSrc(st.question))
    w.setAttribute('style', 'width:100%;flex:1 1 auto;min-height:340px;border:0;background:transparent')
    const onFail = ev => {
      if (version !== configVersion) return
      if (ev && ev.errorCode === -3) return // aborted navigations are ours
      patch({ probe: 'offline', probeDetail: ((ev && ev.errorCode) != null ? ev.errorCode : '?') + ' ' + ((ev && ev.description) || ''), lastCheck: Date.now() })
    }
    const onNav = ev => {
      if (version !== configVersion) return
      const o = originOf(ev && ev.url)
      patch({ navOrigin: o })
      if (o && o === st.url) {
        const cur = getState()
        const heal = !cur.dismissed && (cur.probe === 'unknown' || cur.probe === 'offline')
        patch({ probe: 'ok', probeDetail: 'guide loaded', lastCheck: Date.now(),
          ...(heal ? { nonce: st.nonce + 1 } : {}) })
      }
    }
    const onWin = ev => {
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault()
      if (version === configVersion && ev && isConfiguredOrigin(ev.url)) openExt(ev.url)
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

  // Palette "ask the library" → focus the Ask bar after the pane reveals;
  // the S3 key banner's paste/update key buttons reuse the same bump with
  // focusTarget='key'.
  useEffect(() => {
    if (!s.focusSeq) return
    const wantKey = focusTarget === 'key'
    focusTarget = ''
    const t = setTimeout(() => {
      const el = wantKey ? keyInputEl : askInputEl
      if (el) { try { el.focus(); el.select && el.select() } catch { /* focus is best-effort */ } }
    }, 60)
    return () => clearTimeout(t)
  }, [s.focusSeq])

  // Prefill the reused edit row when the assistant appears so fixing a
  // typo/port is an edit, not a retype. Deps fire only on real transitions.
  useEffect(() => {
    if (assistantMode) setUrlDraft(getState().url)
  }, [assistantMode, s.url])

  const closeEdit = () => {
    setUrlDraft('')
    setKeyDraft(null)
    setErr('')
    setEditing(false)
  }

  const openEdit = () => {
    if (editing) { closeEdit(); return }
    setUrlDraft(st.url)
    setEditing(true)
  }

  // S3 key banner buttons: open the SAME reused edit row, focus the key field.
  const focusKey = () => {
    if (!editing) { setUrlDraft(st.url); setEditing(true) }
    focusTarget = 'key'
    patch({ focusSeq: st.focusSeq + 1 })
  }

  const editUrl = value => {
    const next = splitKeyPaste(value)
    if ((draft.origin && draft.origin !== next.origin) || (next.key && draft.key !== next.key)) setKeyDraft(null)
    setUrlDraft(value)
    setErr('')
  }

  const save = () => {
    if (draft.error) { setErr(draft.error); return }
    const changedServer = draft.origin !== st.url
    const key = keyDraft === null ? suggestedKey : keyDraft.trim()
    if (store) {
      // Clear the old key first so an interrupted save cannot pair it with a new server.
      if (changedServer) store.set('lastbookKey', '')
      store.set('lastbookUrl', draft.origin)
      store.set('lastbookKey', key)
    }
    configVersion++
    // T12: every Save re-arms the assistant (dismiss/advanced are memory-only).
    patch({ url: draft.origin, key, question: changedServer ? '' : st.question, copyUrl: '',
      navOrigin: '', probe: 'off', modelOnline: null, probeDetail: '', nonce: st.nonce + 1,
      probeInFlight: false, lastCheck: 0, dismissed: false, advancedOpen: false })
    closeEdit()
    probeTick()
    ensureTimer()
  }

  // ⟳ retry check (T6): flags in-flight UI, then calls the SAME single probe.
  // No parallel probes: probeTick's own guard dedupes; completion clears the
  // flag whether or not this click started it.
  const onRetry = () => {
    const cur = getState()
    if (!cur.url || cur.probeInFlight) return
    patch({ probeInFlight: true })
    probeTick(true)
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

  // ── reused edit row (UX spec §5 — identical inputs, handlers and error
  //    lines as v1.0.1; the assistant embeds this very node, component-level
  //    reuse, zero new inputs or storage keys) ───────────────────────────────
  const editRow = jsxs('div', { className: 'lb-setup', children: [
    jsx('input', {
      type: 'text', className: 'lb-input', value: urlDraft,
      placeholder: 'http://127.0.0.1:8890 or your tailnet URL',
      onChange: e => editUrl(e.target.value)
    }),
    jsx('input', {
      type: 'password', className: 'lb-input', value: keyDraft ?? suggestedKey,
      placeholder: 'access key (only if your server needs one)',
      ref: el => { keyInputEl = el },
      onChange: e => setKeyDraft(e.target.value)
    }),
    err && jsx('div', { className: 'lb-err', children: err }),
    jsxs('div', { style: { display: 'flex', gap: '6px' }, children: [
      jsx('button', { type: 'button', className: 'lb-btn', onClick: save, children: 'Save' }),
      !!s.url && jsx('button', { type: 'button', className: 'lb-btn', onClick: closeEdit, children: 'Cancel' })
    ] })
  ] })

  // ── assistant frame (UX spec §4) ──────────────────────────────────────────
  const step = (n, title, body, extra) => jsxs('div', { className: 'lb-step', children: [
    jsx('div', { className: 'lb-step-title', children: n + '. ' + title }),
    (body || extra) ? jsxs('div', { className: 'lb-step-body', children: [body || null, extra || null] }) : null
  ] })

  const dlCaption = 'Opens lastbook.org in your browser — save dialogs, SmartScreen/Gatekeeper prompts, and the install itself are yours to confirm; this plugin only opens the official link.' +
    (osGuess() === 'macos' ? ' Lastbook for Mac needs Apple Silicon (M1+) on macOS 14 or newer.' : '')
  const dlButton = jsx('button', { type: 'button', className: 'lb-btn', onClick: () => openExt(LASTBOOK_DOWNLOAD_URL), children: downloadLabel() })

  // §4.4: the retry button is clickable whenever the assistant is up — it is
  // disabled ONLY while a check is in flight (S5), which is also when it
  // reads checking… (same slot, label change, no layout shift).
  const retryButton = jsx('button', { type: 'button', className: 'lb-btn', disabled: mode === 'S5' || !s.url,
    onClick: onRetry, children: mode === 'S5' ? 'checking…' : '⟳ retry check' })
  const diagLine = assistantMode
    ? jsx('div', { className: 'lb-diag', children: 'still nothing — last check ' + fmtTime(s.lastCheck) + ', ' + (s.probeDetail || 'no answer') })
    : null

  const steps = loopBranch ? [
    step('1', 'install lastbook', jsx('div', { className: 'lb-caption', children: dlCaption }), dlButton),
    step('2', 'open lastbook', 'Open Lastbook and let it load. The guide serves itself at http://127.0.0.1:8890 — leave it open. Running Lastbook on another machine instead? Put that URL in the field below and skip the install.'),
    step('3', 'paste the url', 'Paste the URL your guide shows. Shared server? paste the whole access link including ?key= — the key stays on this machine.', editRow),
    step('4', 'check again', jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }, children: [retryButton, diagLine] }))
  ] : [
    step('1', 'wake the server', 'On the server machine, open Lastbook (or start the guide directly: python server.py --port 8890 --lan). A shared URL stops working the moment that machine sleeps.'),
    step('2', 'confirm the link', 'Check host and port with whoever runs the server — a new IP or forwarder breaks old links silently.'),
    step('3', 'paste the access link', 'Paste the full access link including ?key= below — the key stays on this machine.', editRow),
    step('4', 'check again', jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }, children: [retryButton, diagLine] }))
  ]

  const assistantTitle = mode === 'S0' ? 'get set up with lastbook'
    : (loopBranch ? "lastbook isn't answering" : "your shared server isn't answering")
  const assistantSub = loopBranch
    ? ' Usually Lastbook just isn\'t open on this computer — a blocked port can look the same from here, so these steps cover both.'
    : ' The machine hosting Lastbook may be asleep, its server may be stopped, or the URL/key changed. Nothing needs installing on this computer — this pane only talks to that server.'

  const advancedPanel = jsxs('div', { className: 'lb-adv', children: [
    jsx('div', { children: 'Running the guide headless (e.g. on an NVIDIA Spark or a server with no GUI): from the Lastbook app folder run python server.py --port 8890 --lan with LASTBOOK_DATA set; read the access key from $LASTBOOK_DATA/derived/lan-key on that machine and paste http://<host>:<port> plus that key above. The key never leaves that machine except to this pane.' }),
    jsx('div', { className: 'lb-caption', children: integrityLine() }),
    jsx('button', { type: 'button', className: 'lb-btn', onClick: () => openExt(SETUP_DOCS_URL), children: 'full setup guide ↗' }),
    jsx('div', { className: 'lb-caption', children: 'Lastbook is MIT-licensed offline survival software by the Lastbook contributors; this plugin is an independent client.' })
  ] })

  const assistant = jsxs('div', { className: 'lb-assist', children: [
    jsx('div', { className: 'lb-assist-title', children: assistantTitle }),
    jsxs('div', { className: 'lb-assist-sub', children: [
      'Nothing replied at ', jsx('b', { children: s.url || 'http://127.0.0.1:8890' }), assistantSub
    ] }),
    jsx('div', { className: 'lb-steps', children: jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' }, children: steps }) }),
    jsx('button', { type: 'button', className: 'lb-btn', onClick: () => openExt(LASTBOOK_DOWNLOAD_URL), children: 'or run your own server on this computer →' }),
    jsxs('div', { className: 'lb-linksrow', children: [
      assistantMode && jsx('button', { type: 'button', className: 'lb-btn', onClick: () => patch({ advancedOpen: !st.advancedOpen }), children: s.advancedOpen ? 'hide details' : 'advanced' }),
      jsx('button', { type: 'button', className: 'lb-btn', onClick: () => openExt(SETUP_DOCS_URL), children: 'full setup guide ↗' }),
      assistantMode && jsx('button', { type: 'button', className: 'lb-btn', onClick: () => patch({ dismissed: true }), children: 'not now' })
    ] }),
    assistantMode && s.advancedOpen && advancedPanel
  ] })

  const keyBanner = mode === 'S3' ? jsxs('div', { className: 'lb-keybanner', children: [
    jsx('span', { style: { flex: '1 1 auto' }, children:
      '⚿ the server is up but wants an access key. Paste the access link (with ?key=…) or just the key below — it stays on this machine.' +
      (s.key ? ' (the key you saved may be stale or belong to a different server)' : '') }),
    jsx('button', { type: 'button', className: 'lb-btn', onClick: focusKey, children: s.key ? 'update key' : 'paste key' })
  ] }) : null

  return jsx('div', { className: 'lb-wrap', ref: wrapRef, children: jsxs('div', { style: { display: 'flex', flexDirection: 'column', minHeight: 0, flex: '1 1 auto' }, children: [
    // 1 · meta row — pill unchanged (A2 honest copy); S1 gets the `setup`
    //     re-entry button; ↗ browser hides while the assistant is up (Ask
    //     needs a live server).
    jsxs('div', { className: 'lb-meta', children: [
      jsx('span', { className: meta[0], children: meta[1](s) }),
      s.navOrigin && jsx('span', { className: 'lb-origin', children: s.navOrigin }),
      mode === 'S1' && jsx('button', { type: 'button', className: 'lb-btn', onClick: () => patch({ dismissed: false }), children: 'setup' }),
      !!s.url && jsx('button', { type: 'button', className: 'lb-btn', onClick: openEdit, children: 'url' }),
      !!s.url && !assistantMode && jsx('button', { type: 'button', className: 'lb-btn', onClick: () => openExt(buildAskUrl(getState().question)), children: '↗ browser' }),
      !!s.url && jsx('button', { type: 'button', className: 'lb-btn', onClick: () => patch({ nonce: st.nonce + 1 }), children: '⟳ reload' })
    ] }),

    // 2 · hint strip (close-pane quirk; first run until dismissed) —
    //     independent of the assistant, per §5.
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

    // 3 · assistant (S0/S4/S5) — or the compact S3 key banner above a fully
    //     visible embed — or the standalone edit row (v1.0.1 behaviour).
    assistantActive && assistant,
    !assistantActive && keyBanner,
    !assistantActive && showEditRow && editRow,

    // 4 · the embed (ground truth of reachability) — kept mounted at
    //     height-0 while the assistant is up (§3.4; NOT display:none, so
    //     did-navigate/did-fail-load keep firing and can heal the pane
    //     without the user pressing retry). If live measurement ever shows
    //     height-0 suppresses those events, the documented fallback is to
    //     drop lb-mount-hidden and let it sit visible below the assistant
    //     at its normal min-height (UX spec §3.4 / gate L10).
    !!s.url && jsx('div', { className: assistantMode ? 'lb-mount lb-mount-hidden' : 'lb-mount', ref: mountRef }),

    // 5 · Ask bar (empty question → plain #/ask) — hidden while the
    //     assistant is up; Ask needs a live server.
    !!s.url && !assistantMode && jsxs('div', { className: 'lb-askbar', children: [
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

// ── styles (app theme vars only) ────────────────────────────────────────────
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
  '.lb-btn:disabled { opacity: .6; cursor: default; }',
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
  '.lb-mount-hidden { flex: 0 0 0; height: 0; min-height: 0; overflow: hidden; }',
  '.lb-askbar { display: flex; gap: 8px; padding: 8px 10px; flex: 0 0 auto;',
  '  border-top: 1px solid var(--ui-stroke-secondary); align-items: center; }',
  '.lb-askbar .lb-input { flex: 1 1 auto; }',
  '.lb-copy { display: flex; gap: 8px; align-items: center; margin: 0 10px 6px; padding: 8px 10px;',
  '  font-size: 12px; border: 1px solid var(--ui-stroke-secondary); border-radius: 8px; flex: 0 0 auto; }',
  '.lb-copy input { flex: 1 1 auto; font-size: 11px; padding: 3px 8px; border-radius: 6px;',
  '  border: 1px solid var(--ui-stroke-secondary); background: transparent; color: var(--ui-text-primary); }',
  '.lb-assist { display: flex; flex-direction: column; gap: 10px; padding: 12px; font-size: 12px;',
  '  color: var(--ui-text-secondary); flex: 0 0 auto; }',
  '.lb-assist-title { font-size: 13px; color: var(--ui-text-primary); }',
  '.lb-assist-sub { line-height: 1.45; }',
  '.lb-steps { display: flex; flex-direction: column; gap: 10px; }',
  '.lb-step { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }',
  '.lb-step-title { color: var(--ui-text-primary); }',
  '.lb-step-body { line-height: 1.45; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }',
  '.lb-step-body .lb-setup { padding: 4px 0 0; }',
  '.lb-caption { color: var(--ui-text-tertiary); font-size: 11px; line-height: 1.4; }',
  '.lb-diag { color: var(--ui-text-tertiary); font-size: 11px; }',
  '.lb-linksrow { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }',
  '.lb-adv { display: flex; flex-direction: column; gap: 8px; padding: 10px; align-items: flex-start;',
  '  border: 1px dashed var(--ui-stroke-secondary); border-radius: 8px; line-height: 1.45; }',
  '.lb-keybanner { display: flex; gap: 10px; align-items: center; margin: 0 10px 6px; padding: 8px 10px;',
  '  font-size: 12px; border: 1px solid rgba(244,180,80,.5); border-radius: 8px;',
  '  color: var(--ui-text-secondary); flex: 0 0 auto; }'
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

    // T12: assistant dismiss/advanced state is memory-only — a plugin
    // reload re-arms the assistant.
    patch({
      url: store.get('lastbookUrl', '') || '',
      key: store.get('lastbookKey', '') || '',
      question: '', copyUrl: '', navOrigin: '',
      hintSeen: Number(store.get('hintSeen', 0)) ? 1 : 0,
      probe: 'off', modelOnline: null, probeDetail: '',
      probeInFlight: false, lastCheck: 0, dismissed: false, advancedOpen: false
    })

    const style = document.createElement('style')
    style.setAttribute('data-lb', ID)
    style.textContent = CSS
    document.head.appendChild(style)
    ctx.onDispose(() => style.remove())

    ctx.register({
      id: 'guide', area: 'panes', title: 'lastbook',
      data: { placement: 'main', dock: { pane: 'workspace', pos: 'right', enforce: true }, width: '28rem', minWidth: '22rem' },
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
      configVersion++
      clearTimer()
      if (activeWebview) {
        try { activeWebview.remove() } catch { /* already detached */ }
        activeWebview = null
      }
      askInputEl = null
      keyInputEl = null
      subs.clear()
    })
  }
}
