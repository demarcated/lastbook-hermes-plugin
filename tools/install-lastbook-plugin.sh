#!/usr/bin/env bash
#
# Tier 2 setup helper for the "Lastbook · Survival Guide" Hermes desktop plugin (macOS).
#
# Installs the Hermes INTEGRATION (plugin.js) into ~/.hermes/desktop-plugins/lastbook-guide/
# and points you at the OFFICIAL Lastbook app from lastbook.org. This helper never
# downloads, bundles, mirrors or re-releases Lastbook itself or its library packs.
#
# What it does, in order:
#   1. Finds the Hermes home (~/.hermes on macOS) and its desktop-plugins folder.
#   2. Checks whether /Applications/Lastbook.app exists; if not, prints the official
#      instructions and (only if you agree) opens https://lastbook.org in your browser.
#   3. Copies plugin.js into place, backing up any existing file first, then re-hashes
#      the file on disk to confirm the copy.
#   4. Prints the exact next steps inside Hermes (Ctrl+K -> "Reload desktop plugins").
#
# What it NEVER does: no sudo, no admin rights, no deletes, no PATH edits, no pack
# downloads. It writes only inside ~/.hermes/desktop-plugins.
#
# Usage:
#   ./install-lastbook-plugin.sh                                  # repo copy beside tools/
#   ./install-lastbook-plugin.sh --plugin-source /path/plugin.js
#   ./install-lastbook-plugin.sh --plugin-url https://... --expected-sha256 <64-hex>
#
set -euo pipefail

PLUGIN_ID="lastbook-guide"
PLUGIN_NAME="Lastbook · Survival Guide"
OFFICIAL_SITE="https://lastbook.org"
# Pinned release build (tier 1 plugin.js, 24,432 bytes, 2026-11-19). The README repeats this hash.
PINNED_SHA256="37e87ead6dafda3e31a06b1569f1505547ac3db35d39e32141adb801df26406c"

step() { printf '\n\033[36m== %s\033[0m\n' "$1"; }
note() { printf '   %s\n' "$1"; }
warn() { printf '   \033[33m! %s\033[0m\n' "$1"; }
fail() { printf '   \033[31mx %s\033[0m\n' "$1" >&2; cleanup_tmp; exit 1; }

confirm_yes() {
  # Never block on a prompt that no one can answer (piped/non-interactive runs).
  [ -t 0 ] || return 1
  read -r -p "$1 [y/N] " ans || return 1
  case "$ans" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

hash_file() {  # prints lowercase sha256 of $1, using whichever tool this Mac has
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print tolower($1)}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print tolower($1)}'
  else
    fail "neither shasum nor sha256sum is available to verify the file"
  fi
}

TMPFILE=""
cleanup_tmp() { [ -n "${TMPFILE:-}" ] && rm -f "$TMPFILE" 2>/dev/null; true; }
trap cleanup_tmp EXIT

PLUGIN_SOURCE=""
PLUGIN_URL=""
EXPECTED_SHA256=""

while [ $# -gt 0 ]; do
  case "$1" in
    --plugin-source)    PLUGIN_SOURCE="${2:?--plugin-source needs a path}"; shift 2 ;;
    --plugin-url)       PLUGIN_URL="${2:?--plugin-url needs a URL}"; shift 2 ;;
    --expected-sha256)  EXPECTED_SHA256="${2:?--expected-sha256 needs a hash}"; shift 2 ;;
    -h|--help)          sed -n '2,20p' "$0"; exit 0 ;;
    *)                  fail "unknown argument: $1 (try --help)" ;;
  esac
done

printf '\n\033[32m%s :: Hermes desktop setup helper (macOS)\033[0m\n' "$PLUGIN_NAME"
echo 'Installs the Hermes integration only. Lastbook itself comes only from lastbook.org.'

# ---------------------------------------------------------------- 0. locate plugin.js
step 'Step 1: find the plugin file to install'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DEFAULT="$(cd "$SCRIPT_DIR/.." && pwd)/plugin.js"

if [ -n "$PLUGIN_URL" ] && [ -n "$PLUGIN_SOURCE" ]; then
  fail "give either --plugin-source or --plugin-url, not both"
fi

if [ -n "$PLUGIN_URL" ]; then
  [ -n "$EXPECTED_SHA256" ] || fail "--plugin-url requires --expected-sha256 so the download can be verified. Refusing to install an unverified file."
  command -v curl >/dev/null 2>&1 || fail "curl is needed to download the plugin file"
  # HTTPS everywhere, with one exception: a plain-http mirror on this very computer.
  case "$PLUGIN_URL" in
    https://*)                          curl_proto="=https" ;;
    http://127.*|http://localhost:*|http://\[::1\]:*) curl_proto="=http,https" ;;
    *) fail "only https:// URLs (or an http://127.0.0.1 mirror) are accepted for the download." ;;
  esac
  note "downloading $PLUGIN_URL"
  TMPFILE="$(mktemp "${TMPDIR:-/tmp}/lastbook-plugin.XXXXXX")"
  curl -fsSL --proto "$curl_proto" --tlsv1.2 -o "$TMPFILE" "$PLUGIN_URL" || fail "download failed"
  dl_hash="$(hash_file "$TMPFILE")"
  if [ "$dl_hash" != "$(printf '%s' "$EXPECTED_SHA256" | tr 'A-F' 'a-f')" ]; then
    fail "downloaded file hash is $dl_hash but you expected $EXPECTED_SHA256 -- install refused. Nothing was installed."
  fi
  SOURCE_PATH="$TMPFILE"
  note 'download hash matches the expected value.'
elif [ -n "$PLUGIN_SOURCE" ]; then
  [ -f "$PLUGIN_SOURCE" ] || fail "no file at --plugin-source: $PLUGIN_SOURCE"
  SOURCE_PATH="$(cd "$(dirname "$PLUGIN_SOURCE")" && pwd)/$(basename "$PLUGIN_SOURCE")"
elif [ -f "$REPO_DEFAULT" ]; then
  SOURCE_PATH="$REPO_DEFAULT"
  note "using the plugin.js that ships beside this helper: $SOURCE_PATH"
else
  fail "no plugin.js found beside this helper. Pass --plugin-source <path> or --plugin-url <url> --expected-sha256 <hash>."
fi

SOURCE_HASH="$(hash_file "$SOURCE_PATH")"
if [ -n "$EXPECTED_SHA256" ] && [ -z "$PLUGIN_URL" ]; then
  [ "$SOURCE_HASH" = "$(printf '%s' "$EXPECTED_SHA256" | tr 'A-F' 'a-f')" ] \
    || fail "file hash is $SOURCE_HASH but you expected $EXPECTED_SHA256 -- install refused."
elif [ -z "$EXPECTED_SHA256" ] && [ "$SOURCE_HASH" != "$PINNED_SHA256" ]; then
  warn "this file's SHA-256 ($SOURCE_HASH) is not the pinned release ($PINNED_SHA256)."
  confirm_yes 'Install this other build anyway?' || fail 'install cancelled by you. Nothing was changed.'
else
  note "SHA-256 verified against the pinned release: $SOURCE_HASH"
fi

# ---------------------------------------------------------------- 1. Hermes home
step 'Step 2: the Hermes desktop plugin folder'
if [ "$(uname)" != "Darwin" ]; then
  warn "this helper is written and tested for macOS; on $(uname) it uses the Hermes home convention ~/.hermes and was not verified."
fi
HERMES_HOME="${HOME}/.hermes"
PLUGIN_DIR="${HERMES_HOME}/desktop-plugins/${PLUGIN_ID}"
note "installing to: $PLUGIN_DIR"
note 'On macOS the desktop app reads ~/.hermes/desktop-plugins (a hidden folder in your home).'
mkdir -p "$PLUGIN_DIR"

# ---------------------------------------------------------------- 2. Lastbook: point, never re-release
step 'Step 3: do you already run Lastbook?'
if [ -d "/Applications/Lastbook.app" ] || [ -d "${HOME}/Applications/Lastbook.app" ]; then
  note 'Lastbook detected in your Applications folder. Good -- you can skip straight to the plugin setup in Hermes.'
else
  note 'No Lastbook install was detected in /Applications.'
  cat <<EOF

   Lastbook is separate software from lastbook.org. This helper will not download it for you.
   The official way, in order:

     1. Download the signed installer for macOS (Apple Silicon, macOS 14 or later) from
        https://lastbook.org -- the build is signed and notarized by the Lastbook project.
     2. Open Lastbook once and let its first-run setup choose and download a library pack
        (Small, Medium or All) plus a state map. The app downloads only from
        downloads.lastbook.org and checks every file's SHA-256 before using it. No other
        tool -- not this helper -- should ever fetch packs for you.
     3. Decide what URL the Hermes panel should open:
          - Someone shares a guide with you: use their access link, the one that ends in
            ?key=... You will paste the whole link into the panel later.
          - You run the guide yourself: the Lastbook desktop app opens NO network port of
            its own, so the panel needs the Lastbook guide server instead. On the computer
            that holds the library, run the Lastbook guide server (from a Lastbook source
            checkout with Python 3.11+):
                python3 server.py --data "/path/to/LastbookData"
            It answers at http://127.0.0.1:8890 (no key needed there). Add --lan to reach
            other devices; the console prints the exact access link with the key.
        See docs/INSTALL-MACOS.md, "Getting a Lastbook URL", for the same steps in prose.
EOF
  if confirm_yes "Open ${OFFICIAL_SITE} in your browser now?"; then
    if open "$OFFICIAL_SITE" 2>/dev/null; then
      note 'opened the official site in your default browser.'
    else
      warn "could not open the browser automatically -- visit ${OFFICIAL_SITE} yourself."
    fi
  else
    note "skipped. Whenever you are ready, go to ${OFFICIAL_SITE} yourself."
  fi
fi

# ---------------------------------------------------------------- 3. install with backup + read-back
step 'Step 4: install the plugin file'
DEST="${PLUGIN_DIR}/plugin.js"
if [ -f "$DEST" ]; then
  DEST_HASH="$(hash_file "$DEST")"
  if [ "$DEST_HASH" = "$SOURCE_HASH" ]; then
    note 'the identical file is already installed -- nothing to do. (Re-running is always safe.)'
    exit 0
  fi
  BAK="${DEST}.pre-${DEST_HASH:0:8}.bak"
  cp -p "$DEST" "$BAK"
  note "kept the previous file as: $BAK"
fi
cp "$SOURCE_PATH" "$DEST"
READ_BACK="$(hash_file "$DEST")"
if [ "$READ_BACK" != "$SOURCE_HASH" ]; then
  warn "the file ON DISK hashes to $READ_BACK, not $SOURCE_HASH -- something is off."
  warn 'your previous build is still in the .bak file beside it; copy it back by hand if you had one.'
  fail 'install NOT confirmed. Nothing else was changed.'
fi
note "installed and read-back verified: $DEST"
note "SHA-256 on disk: $READ_BACK"

# ---------------------------------------------------------------- 4. what to do inside Hermes
step 'Step 5: finish inside Hermes (two minutes)'
cat <<'EOF'
  1. In the Hermes desktop app press Ctrl+K and choose "Reload desktop plugins".
     (A new plugin.js on disk stays dormant until a reload or an app restart.)
  2. Check Settings > Plugins: "Lastbook · Survival Guide" should be listed and enabled.
  3. Press Ctrl+K and choose "Lastbook: open survival guide". The panel opens along the
     right side of the window. Paste your Lastbook URL (for example http://127.0.0.1:8890
     or the tailnet address you were given). If someone shares the guide with an access
     link, paste the WHOLE link including ?key= -- the panel splits it for you.
     Press Save. The guide should appear inside the panel.
  4. A small "lastbook" chip in the status bar (bottom right) mirrors the connection:
     filled dot = reachable, key symbol = needs the access key, hollow dot = offline.
EOF

cat <<'EOF'
  ONE QUIRK TO KNOW BEFORE YOU CLOSE ANYTHING:
  Closing the plugin's only pane tab DISABLES the plugin (app-owned PluginDecisions in
  the renderer's localStorage persists across restarts; the file on disk is untouched).
  Recovery: Ctrl+K -> "Reload desktop plugins", then the lastbook chip (bottom right) or
  Ctrl+K -> "Lastbook: open survival guide" brings the pane back. This is a known Hermes
  gap with an upstream report on file, not a Lastbook or plugin defect. Details in
  docs/TROUBLESHOOTING.md.
EOF

echo
echo "Done. Only files written: $DEST (plus a .bak of any previous copy)."
echo 'No admin rights were used; nothing was downloaded from anywhere but the URL you gave.'
echo 'Lastbook is MIT-licensed offline survival software by the Lastbook contributors (c) 2026, lastbook.org.'
