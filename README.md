# Lastbook · Hermes Desktop Plugin

Put your Lastbook survival guide inside the Hermes desktop app: a guide panel, a
status-bar chip, Ctrl+K commands and Ask deep-links — pointed at **your own** Lastbook
server. The plugin talks only to the URL you configure.

> **STATUS: tier-1 release.** The pinned build is `plugin.js` — its SHA-256 lives in
> `plugin.sha256` and is repeated in the verification table below. Independent project
> (MIT); Lastbook itself is MIT-licensed by its own authors.

---

## What this is — and what it is not

This repository ships the **Hermes desktop integration** for Lastbook: one `plugin.js`
plus a setup helper and these docs. It is **not** a Lastbook re-release. We never
bundle, mirror, re-host or re-release the Lastbook app, its library packs (PDFs, videos,
encyclopedias, maps) or its web UI. The plugin connects to a Lastbook server **you**
run or **you** name.

Lastbook ("Lastbook · Survival Guide") is separate, MIT-licensed offline survival
software from [lastbook.org](https://lastbook.org). Get the app and its library packs
only from there — see [Getting a Lastbook URL](#getting-a-lastbook-url).

## Which tier are you?

| You are… | Use | Go to |
|---|---|---|
| Already running a Lastbook server, or someone gave you an access link | **Tier 1** — the plugin alone | [Windows](docs/INSTALL-WINDOWS.md#tier-1-if-you-already-have-a-lastbook-url) · [macOS](docs/INSTALL-MACOS.md#tier-1-if-you-already-have-a-lastbook-url) |
| New: you don't have Lastbook yet | **Tier 2** — setup helper points you at the official app, then installs the plugin | [Windows](docs/INSTALL-WINDOWS.md#tier-2-new-to-lastbook-use-the-setup-helper) · [macOS](docs/INSTALL-MACOS.md#tier-2-new-to-lastbook-use-the-setup-helper) |

Both tiers install the same single file into the Hermes desktop plugin folder. The
difference is only how you get a Lastbook to point it at.

## Quick start (the 3-minute version)

1. **Install the file** at the right path for your OS:
   - **Windows:** `C:\Users\<you>\AppData\Local\hermes\desktop-plugins\lastbook-guide\plugin.js`
     — open the Run box (Win+R), type `%LOCALAPPDATA%\hermes`, and create the folders.
     **Not** `C:\Users\<you>\.hermes` — the Windows app never reads that folder.
   - **macOS:** `~/.hermes/desktop-plugins/lastbook-guide/plugin.js`
     — in Terminal: `mkdir -p ~/.hermes/desktop-plugins/lastbook-guide` then copy the file in.
   Or run the helper for you: `tools\install-lastbook-plugin.ps1` (Windows) or
   `tools/install-lastbook-plugin.sh` (macOS).
2. **Wake Hermes up:** press `Ctrl+K` and choose **"Reload desktop plugins"**. A new
   `plugin.js` on disk stays dormant until a reload or an app restart.
3. **Open the panel:** `Ctrl+K` → **"Lastbook: open survival guide"**. Paste your
   Lastbook URL (example: `http://127.0.0.1:8890`) — or the whole access link including
   `?key=` if someone shares a guide with you — and press Save.

The full walkthroughs, with the checks a first-timer should make at each step, are in
[docs/INSTALL-WINDOWS.md](docs/INSTALL-WINDOWS.md) and
[docs/INSTALL-MACOS.md](docs/INSTALL-MACOS.md).

## Getting a Lastbook URL

The panel needs an address to open. Three ways to have one:

- **Someone shares a guide with you.** They give you an access link that looks like
  `http://100.x.y.z:8891/?key=abcdef…`. Paste the whole thing into the panel's URL box;
  the panel splits the key out for you and keeps it only on this machine.
- **You run the guide on a computer you control.** The official Lastbook **desktop app
  opens no network port at all** (by design — it is a self-contained window). So the
  panel talks to the **Lastbook guide server** instead: on the computer holding the
  library, from a Lastbook source checkout with Python 3.11+,
  `python3 server.py --data /path/to/LastbookData` answers at `http://127.0.0.1:8890`
  with no key required. Add `--lan` to reach other devices; the console prints the exact
  access link including the key.
- **You use a guide shared on a private network** (home LAN, Tailscale tailnet): same
  as above, started by whoever runs it; you use the access link they print.

The desktop app from lastbook.org remains the official way to **install Lastbook and
download the library packs** (Small, Medium or All, plus a state map). Its first-run
setup is the only thing that should ever fetch packs — from `downloads.lastbook.org`,
SHA-256-checked. The helper and the plugin never download packs.

A full guided walkthrough — first run on a new computer, connecting to a shared
server, and running the guide server **headless** (advanced, e.g. on an NVIDIA Spark)
— is in [docs/SETUP.md](docs/SETUP.md).

## The one quirk you must know

**Closing the plugin's only pane tab disables the plugin.** The app remembers the closed
tab across restarts; the file on disk is untouched and looks fine the whole time.

Recovery takes ten seconds: press `Ctrl+K` → **"Reload desktop plugins"**, then click the
`lastbook` chip in the status bar (bottom right) or press `Ctrl+K` →
**"Lastbook: open survival guide"**. More in
[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

This is a known Hermes gap (an upstream report is on file), not a Lastbook or plugin bug.

## What you get once it's running

- A **guide panel** docked along the right side of the Hermes window, showing the real Lastbook
  guide (search, library, map, Ask) — the real UI, with its citations and status line.
- An **Ask bar**: type a question, press Ask, the embedded guide sends it for you
  (`#/ask?q=` deep-link). `↗` opens the same question in your system browser.
- A **status chip** (bottom right): `◉ lastbook` reachable · `⚿` needs the access key ·
  `○` offline · `◌` unknown · `–` no URL yet. Click it to open the panel.
- Two **Ctrl+K commands**: "Lastbook: open survival guide" and "Lastbook: ask the library".

## Privacy, in one page

- The plugin talks to **one origin only: the URL you configure**. There is exactly one
  network call the plugin makes itself — a best-effort status probe
  (`GET /api/assistant/status`) that only colors the chip. Everything real happens
  inside the embedded guide, which is your server's own page.
- No telemetry, no analytics, no crash reporting, no third-party requests, no mic,
  camera or notifications. No `window.open`; external links go through Hermes' own
  "open in browser" bridge, and only when you click them.
- Your access key is stored **only on this machine** in the plugin's own config store,
  and is sent **only to your server** as the `?key=` parameter your server already asks
  for. Treat it like a Wi-Fi guest password: low-entropy, shareable, not reusable
  elsewhere.
- Switching servers clears the previous server's access key, current question, and copy link.
  Paste the new server's access link or enter its key when you switch.
- Questions you type go only to your server, are never stored by the plugin, and never
  leave toward any other host.

## Release integrity

| Artifact | SHA-256 | Size |
|---|---|---|
| `plugin.js` (tier 1 release build) | `37e87ead6dafda3e31a06b1569f1505547ac3db35d39e32141adb801df26406c` | 24,432 bytes |

The helpers pin the same hash and refuse to install a different file without an explicit
confirmation. `src/plugin.src.js` holds the identical bytes as the editable source.

## Files

```
README.md                      you are here
LICENSE                        MIT (plugin) + Lastbook attribution
plugin.js                      THE artifact — single file, hash-pinned above
src/plugin.src.js              same bytes, editable source of truth
docs/INSTALL-WINDOWS.md        tier 1 + tier 2, step by step (Windows)
docs/INSTALL-MACOS.md          tier 1 + tier 2, step by step (macOS)
docs/SETUP.md                  guided first run · shared server · headless server (advanced)
docs/TROUBLESHOOTING.md        symptoms → fixes, incl. the close-pane quirk
docs/QA-CHECKLIST.md           acceptance checks for both desktop hosts
tools/install-lastbook-plugin.ps1   Windows setup helper
tools/install-lastbook-plugin.sh    macOS setup helper
tests/plugin_scaffold_test.mjs      build gates (G1–G4), node, no deps
```

## License & attribution

The Hermes integration (this repo's `plugin.js`, helpers and docs) is
**MIT-licensed — Copyright (c) 2026 demarcated**. See `LICENSE`.

> Lastbook is MIT-licensed offline survival software by the Lastbook contributors
> (© 2026, [lastbook.org](https://lastbook.org),
> [github.com/Immortal-Protocols/lastbook](https://github.com/Immortal-Protocols/lastbook)).
> This plugin is an independent client: it bundles no Lastbook content and connects only
> to a Lastbook server the user runs or configures. Lastbook medical/survival content
> comes from Hesperian/WHO/Red Cross sources and is not clinically reviewed.

"Lastbook" is used nominatively to identify the software this plugin connects to; no
Lastbook trademarks are claimed as ours.
