# Set up the Lastbook panel — first run, shared servers, and headless servers

This is the full setup guide for the **Lastbook · Hermes Desktop Plugin**: the guided
first-run path when you don't have Lastbook yet, connecting to a server someone else
runs, and an advanced path for running the Lastbook guide server headless (for example
on an NVIDIA Spark or another always-on box with no desktop).

The plugin is a **door, not an installer**. It never downloads, bundles, mirrors,
verifies, or executes the Lastbook app, its binaries, or its library packs. The one
network request the plugin makes on its own is the status probe against the URL *you*
configure. Every download happens in **your system browser**, from the official
lastbook.org site, and every OS prompt — browser save dialog, SmartScreen (Windows),
Gatekeeper (macOS), admin elevation — is **yours to confirm**. The plugin only opens
the official link when you click it.

> Facts about current releases, digests, and upstream claims in this guide were
> checked against lastbook.org on **2026-11-20**. Lastbook ships often (two releases
> rotated within ~36 hours around that date), so always trust the live download page
> over any number written here.

---

## Before you start

You need two things, from two different places:

1. **Lastbook** — the offline survival library, from [lastbook.org](https://lastbook.org).
   Get the app and its library packs **only** from there.
2. **This plugin** — one file, `plugin.js`, from this repository. It puts a Lastbook
   guide panel inside the Hermes desktop app. Install it first; the guide docs are in
   [INSTALL-WINDOWS.md](INSTALL-WINDOWS.md) and [INSTALL-MACOS.md](INSTALL-MACOS.md),
   or run the setup helper in `tools/`.

One fact that trips people up: the official Lastbook **desktop app opens no network
port at all** (by design — it's a self-contained window). The panel talks to the
Lastbook **guide server** (`server.py`), which serves at `http://127.0.0.1:8890` on
the computer that holds the library. The steps below cover both cases.

---

## Path A — Guided first run (new to Lastbook)

With the plugin installed and no reachable server, the pane shows a **setup assistant**
instead of a dead frame. If you dismissed it earlier, press `setup` in the panel's meta
row to bring it back.

### What the assistant shows you

- Title on first run: `get set up with lastbook` — or, if you saved a URL and nothing
  replied: `lastbook isn't answering`.
- A sub-line naming the address it tried, e.g.:
  *"Nothing replied at `http://127.0.0.1:8890`. Usually Lastbook just isn't open on
  this computer — a blocked port can look the same from here, so these steps cover
  both."*
- The four numbered steps below, the same URL/key fields as always (no new settings),
  and links for `advanced` · `full setup guide ↗` · `not now`.
- A status pill: `– not connected` before a URL, `○ offline` or `◌ blocked or offline`
  while nothing answers. The assistant is honest about that ambiguity — a plugin-side
  probe cannot tell "server down" from "server fine but CORS-blocked," so it never
  claims Lastbook "isn't installed." The embedded guide page itself is the ground
  truth: the moment it loads, the panel returns to normal on its own.

### Step 1 — install Lastbook

Press **`⤓ download Lastbook for Windows`** (or **`⤓ download Lastbook for macOS`**,
or plain **`⤓ download Lastbook`** on other systems — the label follows your OS, the
link is always the same). It opens
**<https://lastbook.org/download/>** in your **system browser** — the versionless
official page that always shows the current builds. Save dialogs, SmartScreen /
Gatekeeper prompts, and the install itself are yours to confirm; this plugin only
opens the official link.

- **Windows:** the official Windows installer (64-bit; Windows 10 or later).
- **macOS:** Lastbook for Mac needs **Apple Silicon (M1+) on macOS 14 or newer**.
  As of 2026-11-20, lastbook.org states its Mac build is "signed with our Developer
  ID and notarized by Apple" — that is the upstream page's claim, quoted with its
  date; the plugin itself makes no signing claims.
- **Linux:** the official page also presents Ubuntu `.deb` builds (amd64) — relevant
  if you're setting up a shared or headless server (see Path C).

As of 2026-11-20 the current official release is **Lastbook 1.1.13**, published on
lastbook.org with these SHA-256 digests (from the registry at
`https://lastbook.org/SHA256SUMS.txt`):

| Build | SHA-256 |
|---|---|
| `Lastbook-1.1.13-Setup.exe` | `b35986e71079eeb51bc386f1f31ba002dd5567d8561310f1d095e627a6592ab6` |
| `Lastbook-1.1.13-mac.dmg` | `442b8ac06a3dd1664e8015c494be2899375be1a95e59d0aafd141d11962ea380` |
| `Lastbook_1.1.13_amd64.deb` | `8eb0d5cf2b9479bb54eb6cf9ad5f69cd5b566ade18dc055b966636a7318d0935` |
| `Lastbook_1.1.13_ubuntu26.04_amd64.deb` | `a07069749e982d42906235ca8a7f91fd51a887b638b847f9af7cd91312d09c39` |

Verify after downloading (the plugin never does this for you — it can't see your disk
and doesn't pretend to):

```powershell
# Windows (digest check; certutil ships with Windows)
certutil -hashfile Downloads\Lastbook-1.1.13-Setup.exe SHA256

# Windows (Authenticode chain check, if you have the Windows SDK's signtool)
signtool verify /pv Downloads\Lastbook-1.1.13-Setup.exe
```

```sh
# macOS / Linux
shasum -a 256 Downloads/Lastbook-1.1.13-mac.dmg
```

Note on signatures: upstream publishes checksums, not signature metadata — there is
no machine-readable Authenticode statement in the manifest, the download page, or
`SHA256SUMS.txt` (checked 2026-11-20). So: check the digest yourself, and treat any
signature status as something to verify locally (`signtool verify /pv`) rather than
something this plugin or this guide asserts.

### Step 2 — open Lastbook (and its guide server)

Open Lastbook and let it load; on first run it will have you choose a library pack —
Small, Medium, or All, plus a state map — fetched only from `downloads.lastbook.org`
with SHA-256 checks. Leave it open.

If the panel can't reach `http://127.0.0.1:8890`, start the **guide server** on the
computer that holds the library — from a Lastbook source checkout with Python 3.11+:

```sh
python3 server.py --data /path/to/LastbookData
```

Leave it running; the guide then answers at `http://127.0.0.1:8890`, no key required
on that same computer. Running Lastbook on another machine instead? Put that machine's
URL in the field below and skip the install here (or jump to Path C).

### Step 3 — paste the URL

Paste the URL your guide shows into the panel's URL box (`http://127.0.0.1:8890` for
the same computer). Shared server? Paste the **whole access link including `?key=`** —
the panel splits the key out and stores it only on this machine, sending it only to
your server. Press `Save`.

### Step 4 — check again

Press **`⟳ retry check`**. While it works, the button reads `checking…`. Any HTTP
answer counts as reachable: the pill turns `◉ connected`, the assistant closes, and
the real guide renders in the panel. If it still fails, you get a timestamped
diagnostic line (last check time and the honest cause — timeout, refused connection,
or "blocked or offline") and you can retry. A background check also runs every 60
seconds, so a server that comes back late heals the panel by itself.

**If the server is up but wants a key** (you'll see the `⚿ key needed` pill and a
banner: *"the server is up but wants an access key"*), press `paste key` and paste the
access link (with `?key=…`) or just the key. If a saved key stops working, the banner
offers `update key` — keys belong to one server and go stale when that server is
reinstalled or changed.

---

## Path B — connect to a shared server (nothing to install here)

If someone else runs Lastbook, this pane only talks to their server — nothing needs
installing on your computer. When that server isn't answering (title:
`your shared server isn't answering`), the assistant walks you through:

1. **Wake the server** — on the server machine, open Lastbook (or start the guide
   directly: `python server.py --port 8890 --lan`). A shared URL stops working the
   moment that machine sleeps.
2. **Confirm the link** — check host and port with whoever runs the server; a new IP
   or forwarder breaks old links silently.
3. **Paste the access link** — the full link including `?key=`, e.g.
   `http://192.0.2.20:8891/?key=abcdef…` (or your tailnet address). The key stays on
   this machine.
4. **Check again** — `⟳ retry check`, as in Path A.

The `or run your own server on this computer →` link under the steps opens the same
official download page if you'd rather host your own copy (Path A, step 1).

Treat the access key like a Wi-Fi guest password: low-entropy, shareable, useless
anywhere else. It is stored only in this plugin's own config on this machine, is sent
only to the server you configured, and switching servers clears the old key.

---

## Path C (advanced) — run the guide server headless

For an always-on machine with no desktop GUI — an NVIDIA Spark, a home server, a
cloud box — run the guide server directly. This is the same `server.py` the panel
expects; nothing about the plugin changes.

The pane's own `advanced` panel carries the short version:

> *"Running the guide headless (e.g. on an NVIDIA Spark or a server with no GUI):
> from the Lastbook app folder run `python server.py --port 8890 --lan` with
> `LASTBOOK_DATA` set; read the access key from `$LASTBOOK_DATA/derived/lan-key` on
> that machine and paste `http://<host>:<port>` plus that key above. The key never
> leaves that machine except to this pane."*

Full recipe (proven on an aarch64 NVIDIA Spark; any Linux box works the same way):

**1. Get the code and a venv.** The official Ubuntu `.deb` builds are amd64-only, so
on ARM machines (Spark and friends) run from a source checkout:

```sh
git clone https://github.com/Immortal-Protocols/lastbook.git lastbook-app
cd lastbook-app
python3 -m venv venv
venv/bin/pip install libzim pypdfium2 numpy onnxruntime tokenizers
```

All of those install from published aarch64 wheels — no compilation needed.

**2. Place the library data.** You need a `LastbookData` folder with a library pack
installed. The official route is the desktop app's first-run setup on any machine,
then copy the folder over; if you're downloading pack zips directly from
`downloads.lastbook.org`, verify each file's SHA-256 against the manifest
(`https://downloads.lastbook.org/manifest-v1.json`) before using it. Packs are large
(Small ≈ 8 GB, Medium ≈ 68 GB, All ≈ 388 GB) — plan the disk.

**3. Start the server:**

```sh
cd lastbook-app
LASTBOOK_DATA=/path/to/LastbookData venv/bin/python server.py --port 8890 --lan
```

- `--lan` binds all interfaces; clients from anything other than loopback must present
  the access key. On the server itself, `http://127.0.0.1:8890` stays key-free.
- The key lives at `$LASTBOOK_DATA/derived/lan-key` (mode 0600) on the server:
  `cat "$LASTBOOK_DATA/derived/lan-key"`.
- ⚠️ **Treat the startup log as secret** — the banner prints the access link
  including the key. Don't paste that log into chats, tickets, or pastebins.
- A `403` from a remote machine with no key is the healthy gated response, not an
  outage. From a browser, `http://<host>:<port>/?key=<key>` sets the server's own
  session and loads the guide.

**4. Point the panel at it.** On each Hermes desktop, paste `http://<host>:<port>`
(the address reachable from that machine — LAN IP or tailnet address) plus the key,
or the whole access link at once. Press `Save`, then `⟳ retry check`.

**5. Keep it alive.** `server.py` is not a managed service — after a reboot it's
gone until you start it again. Use whatever supervisor fits your box (a systemd user
unit, a keepalive script) and keep it private: expose it only on a LAN or a private
overlay network (e.g. a tailnet), never directly to the public internet — the access
key is a guest password, not real authentication.

**6. Sanity-check.** From the server itself:

```sh
curl http://127.0.0.1:8890/api/assistant/status
```

JSON with index/coverage state means the server is healthy. The panel's pill
`◉ connected · model off` is fine, too: it means the connection is good and only
Lastbook's own Ask model endpoint isn't configured on the server — that's the guide's
status to report, set up per Lastbook's own docs, and never a plugin problem.

---

## Quick troubleshooting

| Symptom | Likely meaning | Do this |
|---|---|---|
| `○ offline` / `◌ blocked or offline`, assistant up | Nothing answered the probe | Follow the assistant's steps; open the URL in a normal browser to confirm |
| `⚿ key needed` | Server is up; key missing/stale | Re-paste the full access link with `?key=` |
| `◉ connected · model off` | Connected; Ask model not configured on the server | Ask works from the guide's own UI; model setup is upstream's path |
| Guide frame blank but chip is `◉` | Stale embed | `⟳ reload` in the panel's meta row, or `⟳ retry check` |
| No chip, no panel after a reload | The one Hermes quirk: closing the only pane tab disables the plugin | Ctrl+K → "Reload desktop plugins", then the `lastbook` chip |

More in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## Maintainer notes (build-time verification)

This file is the target of the plugin's single pinned documentation link
(`SETUP_DOCS_URL`); the runtime download link is always the versionless
`https://lastbook.org/download/`. Neither ever carries a version number, a digest, or
a key. If you maintain a build of this plugin:

- **Verify official facts at build time**, not from memory:
  - Content manifest (packs/models/maps/addresses, versions and SHA-256s — it does
    **not** contain installer builds): `https://downloads.lastbook.org/manifest-v1.json`
  - Installer checksum registry (by filename; line order is not contractual):
    `https://lastbook.org/SHA256SUMS.txt`
  - Current builds and OS requirements: `https://lastbook.org/download/`
- If your build embeds a version or digest in the pane, it must be **dated and
  attributed** ("as published on lastbook.org on `<date>`"), and omitted entirely
  once older than 30 days. A dated wrong fact is acceptable; an undated stale fact is
  not. Never hardcode versioned download URLs — they rot within days.
- The plugin must never assert signing status beyond quoting the dated lastbook.org
  page claim; publish nothing that implies it installs, verifies, or executes
  anything.
- Docs pages never render inside the Hermes pane — links open in the system browser.

---

## License & attribution

The Hermes integration (this repository's `plugin.js`, helpers and docs) is
**MIT-licensed — Copyright (c) 2026 demarcated**. See [LICENSE](../LICENSE).

> Lastbook is MIT-licensed offline survival software by the Lastbook contributors
> (© 2026, [lastbook.org](https://lastbook.org),
> [github.com/Immortal-Protocols/lastbook](https://github.com/Immortal-Protocols/lastbook)).
> This plugin is an independent client: it bundles no Lastbook content and connects
> only to a Lastbook server the user runs or configures. Lastbook medical/survival
> content comes from Hesperian/WHO/Red Cross sources and is not clinically reviewed.

"Lastbook" is used nominatively to identify the software this plugin connects to; no
Lastbook trademarks are claimed as ours, and nothing here implies endorsement by
Lastbook or its authors.
