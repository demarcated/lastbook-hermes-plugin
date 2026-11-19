# Troubleshooting — Lastbook · Hermes Desktop Plugin

Work down the list; the first two sections cover most reports. When you ask for help,
say which OS, which URL (the address only — **never the key**) and what the chip shows.

A good gut-check at any time: open your Lastbook URL in a normal browser window. If the
guide loads there, the server is fine and the problem is on the Hermes side. If it
doesn't, fix Lastbook first.

---

## Chip and pane are gone

**Symptom:** the `lastbook` chip in the status bar has vanished, "Lastbook: open survival
guide" is missing from Ctrl+K, and nothing lastbook-ish appears anywhere. Usually this
happened right after someone closed the panel's tab.

**What happened:** closing the plugin's only pane tab **disables the plugin**. The app
stores pane decisions itself (on Windows: app-owned `PluginDecisions` in the renderer's
localStorage under `%APPDATA%\Hermes\Local Storage\leveldb`) and that memory persists
across restarts. Your `plugin.js` on disk is untouched and perfect — the app just isn't
loading it.

**Fix, in order:**

1. Press **Ctrl+K** → **"Reload desktop plugins"**. This re-scans the plugin folder and
   is the proven recovery. The chip should return; click it, or press Ctrl+K →
   "Lastbook: open survival guide".
2. If you'd rather use the settings surface: **Settings → Plugins** → toggle
   **"Lastbook · Survival Guide"** off and on again.
3. Restart Hermes if neither is convenient.

**If the Plugins panel shows "No matches" with zero toggles** for a plugin that is
clearly on disk: that's the known upstream gap — a disk plugin that isn't in the app's
catalog can render no toggle once disabled, so the settings surface can't re-enable it.
**Ctrl+K → "Reload desktop plugins" is the way back** (step 1 above). The gap is Hermes'
own, reproduced and reported upstream; this plugin neither causes it nor fixes it. Until
upstream ships a re-enable affordance, treat "close the tab" as "uninstall until reload".

**To keep the pane around:** leave the lastbook tab open in Hermes. Docked where it
ships (bottom of the workspace), it costs one row; you can shrink it, but closing its
tab is the one action that disables the plugin.

## The guide area is blank, grey, or shows a Lastbook deny page

Check these in order:

1. **Did you Save after pasting the URL?** The setup card only goes away after Save.
   Reopen the edit row (the `url` button in the panel's top row), paste, Save.
2. **Is the URL what you meant?** The panel's top row shows the origin it's displaying —
   compare it to what you configured. Common slips: missing port (`:8890`), `https://`
   on a plain-http server, a trailing path you meant to leave off. The plugin keeps only
   scheme+host+port; that's by design.
3. **Does the URL open in a real browser?** If no, the server is down or the address is
   wrong — that's a Lastbook-side fix, not a plugin fix.
4. **A page saying the guide is shared on this network only with an access link?** That's
   Lastbook's own deny page: you're reaching a shared server without the key. Re-paste
   the **whole access link** (the one ending `?key=…`) into the URL box and Save. The
   chip should move from `⚿` to `◉`.
5. **Wrong key:** the deny page appears again after saving. Keys are printed by whoever
   runs the server (`derived/lan-key` on a Lastbook source install; deleting that file
   makes the server pick a new one). Loopback URLs (`http://127.0.0.1:8890`) never need
   a key — if a key box seems to matter there, your URL isn't actually loopback.
6. **Blank with no message at all:** press the panel's `⟳ reload` button (re-creates the
   embedded view), then Ctrl+K → "Reload desktop plugins", then restart Hermes. If a
   corporate proxy or content filter sits between Hermes and the server, the embedded
   view can fail where a plain browser succeeds — check with the URL open in a browser.

## The chip looks wrong

| Chip | Meaning | Do |
|---|---|---|
| `◉ lastbook` | Your server answered the status probe | Nothing — working. |
| `⚿ lastbook` | Server answered but wants the access key | Paste the full access link, Save. |
| `○ lastbook` | Server didn't answer at all | Check Lastbook is running; open the URL in a browser. |
| `◌ lastbook` | Honest "unknown": the probe couldn't complete (a privacy setting on the **server** side can block it — this is expected sometimes) | Nothing functional depends on the chip. If the panel works, ignore it. |
| `– lastbook` | No URL configured yet | Fill the setup card. |

The chip updates every 60 seconds and right after you Save. The **panel is the ground
truth**; the chip is a colored hint that deliberately never blocks anything. If Ask
answers inside the panel but the chip says `◌`, trust the panel.

## Ask doesn't send, or ↗ browser does nothing

- Ask sends your question by opening the guide's own Ask page with the question loaded
  (`#/ask?q=…`). If the embedded guide didn't reload, press `⟳ reload` and try again.
- Empty question + Ask just opens the Ask page — type first.
- `↗` uses Hermes' sanctioned "open in system browser" bridge. If Hermes can't hand off,
  the panel shows a **copy strip** with the full link instead: Copy it and open it
  yourself. (If you see the strip every time, note your Hermes version — worth a report.)

## "I installed it and nothing shows up" (usually the folder)

**Windows:** the desktop app reads **`%LOCALAPPDATA%\hermes\desktop-plugins`**, *not*
`%USERPROFILE%\.hermes\desktop-plugins`. Open Win+R → `%LOCALAPPDATA%\hermes` and confirm
`desktop-plugins\lastbook-guide\plugin.js` exists there. A file in
`C:\Users\<you>\.hermes\...` is invisible to the Windows app — move it.
Then Ctrl+K → "Reload desktop plugins".

**macOS:** the desktop app reads `~/.hermes/desktop-plugins/lastbook-guide/plugin.js`.
In Terminal: `ls -la ~/.hermes/desktop-plugins/lastbook-guide/`. If that shows the file
and Hermes still shows nothing, check the folder name is exactly `lastbook-guide`
(the folder name must equal the plugin id) and that the file is `plugin.js` — not
`plugin.js.txt`. Then Ctrl+K → "Reload desktop plugins".

**Either OS:** compare the full hash with the one in the README. A partial
copy (email round-trips, browser "Save link as" hiccups) is the classic silent failure.

## Where does it keep my URL and key?

In Hermes' own per-plugin config store (`lastbook-guide/lastbookUrl`,
`lastbook-guide/lastbookKey` — surfaced as this plugin's settings storage), on **this
machine only**. Nothing syncs. The key sits in that store in plaintext — treat it like a
Wi-Fi guest password: share it only with people who should see the guide, and prefer
per-person servers if you share broadly. Clearing them: blank the fields in the panel's
edit row and Save, or uninstall the plugin folder and reload.

## Questions about what the plugin sends where

The whole contract in one line: **the plugin talks only to the URL you configure.**
Its own network use is a single status probe to that URL. The guide you see is your
server's own page, and your questions go only to your server. No telemetry, no
analytics, no third parties, no mic/camera/notifications. If you want to see it
yourself: Hermes → right-click → Inspect → Network tab → use the panel; every request
should name your origin.

## Lastbook-side quick checks

- Guide server running? Open the URL in a browser first; that's the fastest truth.
- Ask answers without citations or says the model is unavailable? That's Lastbook's
  local AI, not this plugin — the guide's own status line says what's up.
- Started fresh from source but Ask is dead on a LAN/tailnet server? Ask on the desktop
  app and on a plain `server.py` differ in model wiring; ask whoever set the server up.

## Still stuck?

Collect: OS + Hermes version, the URL origin (no key), chip glyph, what Ctrl+K →
"Reload desktop plugins" changed, and whether the URL opens in a browser. Attach the
`plugin.js` hash (`Get-FileHash` on Windows, `shasum -a 256` on macOS). That package
answers most questions before they're asked.
