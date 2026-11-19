# Install on macOS — Lastbook · Hermes Desktop Plugin

For Apple Silicon Macs (Lastbook's own installer needs macOS 14 or later), with the
**Hermes desktop app** installed. No admin rights needed anywhere in this guide. If
something misbehaves, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

**You need two things, and they come from two different places:**

1. **Lastbook** (the survival library itself) — from [lastbook.org](https://lastbook.org),
   or run by someone you know. You may already have this.
2. **This plugin** (one file, `plugin.js`) — from this folder. It puts the Lastbook
   guide panel inside Hermes. It works only as a window onto a Lastbook you already have.

Pick your path:

- **You already have a Lastbook URL or access link** → [Tier 1](#tier-1-if-you-already-have-a-lastbook-url).
- **You don't have Lastbook yet** → [Tier 2](#tier-2-new-to-lastbook-use-the-setup-helper).

On macOS everything lives under `~/.hermes` (a hidden folder named `.hermes` in your
home folder). That is the correct and only location the desktop app reads on this OS.

---

## Tier 1: If you already have a Lastbook URL

Someone told you to point the panel at something like `http://127.0.0.1:8890` or
`http://192.0.2.20:8891`, or handed you an access link containing `?key=`.

### Option A — run the setup helper (recommended)

The helper copies the file to the right folder, verifies the copy's hash and prints the
next steps.

1. Put this whole folder somewhere you can find (for example
   `~/Documents/lastbook-hermes-plugin`).
2. Open **Terminal** (Cmd+Space, type `Terminal`, Enter) and run:

   ```bash
   cd ~/Documents/lastbook-hermes-plugin
   bash tools/install-lastbook-plugin.sh
   ```

3. Read what it prints. The file it installs must hash to
   `37e87ead6dafda3e31a06b1569f1505547ac3db35d39e32141adb801df26406c`. If it warns that
   a file does **not** match that hash, stop and ask whoever gave you the file — don't
   push through the warning.
4. Skip to [Finish inside Hermes](#finish-inside-hermes).

### Option B — place the file by hand

In Terminal:

```bash
mkdir -p ~/.hermes/desktop-plugins/lastbook-guide
cp ~/Documents/lastbook-hermes-plugin/plugin.js ~/.hermes/desktop-plugins/lastbook-guide/
```

The folder **must** be named exactly `lastbook-guide`. (Prefer Finder? Press Cmd+Shift+G
and type `~/.hermes/desktop-plugins` — it opens the hidden folder, and you can drop the
`lastbook-guide` folder in. Terminal is less error-prone for the hash check, though:)

```bash
shasum -a 256 ~/.hermes/desktop-plugins/lastbook-guide/plugin.js
```

Compare the full hash with the one above.

Then go to [Finish inside Hermes](#finish-inside-hermes).

## Tier 2: New to Lastbook? Use the setup helper

You need Lastbook first. The helper won't download it (only the official app from
lastbook.org should) but it walks you through exactly what to do, in order.

1. Run the helper exactly as in [Tier 1 Option A](#option-a--run-the-setup-helper-recommended).
   It checks `/Applications/Lastbook.app`, notices you don't have Lastbook and prints
   the official route.
2. **Install Lastbook itself:** go to [https://lastbook.org](https://lastbook.org) and
   download the signed macOS installer (Apple Silicon, macOS 14 or later). The helper
   will offer to open the site for you. Drag it into your Applications folder the way
   the site shows.
3. **Open Lastbook once** and let its first-run setup pick a library pack — Small,
   Medium or All — plus a state map. The app downloads packs only from
   `downloads.lastbook.org` and checks every file's SHA-256 before using it. Big packs
   are big downloads; Small is the sensible first choice. Don't fetch packs from any
   other tool or site.
4. **Decide what URL the panel will use** (you need one because the desktop app, by
   design, opens no network port of its own — the panel talks to the Lastbook *guide
   server*, not the desktop window):
   - **A friend or your office already shares a guide?** Use the access link they print
     (it ends in `?key=…`). Skip to [Finish inside Hermes](#finish-inside-hermes) and
     paste the whole link into the panel.
   - **You're running it yourself on this Mac.** From a Lastbook source checkout with
     Python 3.11 or later, in Terminal:

     ```bash
     python3 server.py --data ~/path/to/LastbookData
     ```

     Leave it running. The guide now answers at `http://127.0.0.1:8890` — no key needed
     on the same computer. (Add `--lan` to let phones and other devices join; the
     terminal prints their access link with the key.)
5. Continue with [Finish inside Hermes](#finish-inside-hermes).

## Finish inside Hermes

Takes two minutes. These steps are the same for both tiers.

1. **Reload plugins.** In Hermes press **Ctrl+K** and choose **"Reload desktop plugins"**.
   (A fresh `plugin.js` on disk is dormant until this reload or an app restart.)
2. **Confirm it loaded.** Open **Settings → Plugins**: you should see
   **"Lastbook · Survival Guide"** listed and enabled. A small **`lastbook` chip**
   appears in the status bar at the bottom right.
3. **Open the panel.** Press **Ctrl+K** and choose **"Lastbook: open survival guide"**.
   A panel opens along the right side of the window.
4. **Give it your URL.** The first run shows a setup card with two boxes:
   - Paste your URL (e.g. `http://127.0.0.1:8890`, or the tailnet/LAN address you were
     given) into the URL box.
   - If you have an **access link**, paste the whole thing, `?key=` and all, into the
     URL box — the panel splits the key out automatically. (Or paste just the key into
     the second box.) The key never leaves this machine except to your server.
   - Press **Save**. The Lastbook guide should appear inside the panel.
5. **Try it.** Type a question in the Ask bar at the bottom (something like
   "how do I purify water?") and press **Ask**. The guide answers with citations, like
   Lastbook's own Ask page. `↗` beside it opens the same question in your normal browser.
6. **Read the tip strip once.** It explains the one quirk below; dismiss it when read.

## The quirk (read this before you close anything)

**Closing the plugin's only pane tab disables the plugin.** Hermes remembers the closed
tab, even across restarts. The file on disk stays perfectly fine the whole time — the
disabling lives in the app's own memory of pane decisions.

To bring it back: **Ctrl+K → "Reload desktop plugins"**, then click the **`lastbook`
chip** (bottom right) or press **Ctrl+K → "Lastbook: open survival guide"**. The chip
is your re-entry door; it survives because reloading plugins re-registers everything.

This is a known Hermes gap (reported upstream), not a bug in Lastbook or in this plugin.
If even Ctrl+K → "Reload desktop plugins" doesn't bring the chip back, see
[TROUBLESHOOTING.md](TROUBLESHOOTING.md#chip-and-pane-are-gone).

## Verify it's really working

- The chip shows **`◉ lastbook`** (reachable). `⚿` means it needs your access key —
  re-paste the full access link. `○` means the server isn't answering: check Lastbook's
  guide server is still running by opening your URL in a normal browser.
- The panel's top row shows the origin (like `http://127.0.0.1:8890`) of what you're
  looking at, so you can always see which server the panel is on.
- Quick privacy gut-check: the plugin itself makes exactly one kind of network request
  (a status probe to your own URL). If you're curious, Hermes → right-click → Inspect →
  Network tab while using the panel: every request should go to **your** URL only.

## Uninstall

Delete the folder `~/.hermes/desktop-plugins/lastbook-guide` (any `.bak` files inside
are yours), then Ctrl+K → "Reload desktop plugins". Your Lastbook install and its
library are completely separate and stay untouched.
