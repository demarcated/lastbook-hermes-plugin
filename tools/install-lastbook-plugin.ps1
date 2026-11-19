#Requires -Version 5.1
<#
.SYNOPSIS
  Tier 2 setup helper for the "Lastbook - Survival Guide" Hermes desktop plugin (Windows).

.DESCRIPTION
  Installs the Hermes INTEGRATION (plugin.js) into the Windows desktop plugin folder and
  points you at the OFFICIAL Lastbook app from lastbook.org. This helper never downloads,
  bundles, mirrors or re-releases Lastbook itself or its library packs.

  What it does, in order:
    1. Finds the Hermes desktop home (%LOCALAPPDATA%\hermes) and its desktop-plugins folder.
    2. Checks whether Lastbook appears to be installed; if not, prints the official
       instructions and (only if you agree) opens https://lastbook.org in your browser.
    3. Copies plugin.js into %LOCALAPPDATA%\hermes\desktop-plugins\lastbook-guide\, backing
       up any existing file first, then re-hashes the file on disk to confirm the copy.
    4. Prints the exact next steps inside Hermes (Ctrl+K -> "Reload desktop plugins").

  What it NEVER does: no admin rights, no registry writes, no firewall changes, no PATH
  edits, no deletes, no pack downloads. It writes only inside the desktop-plugins folder.

.PARAMETER PluginSource
  Path to a plugin.js you already have (for example the copy in this repo, next to tools\).

.PARAMETER PluginUrl
  URL to download plugin.js from. Requires -ExpectedSha256. The install is refused when
  the download's hash does not match, exactly as it is refused for an unverified file.

.PARAMETER ExpectedSha256
  The 64-character SHA-256 you expect. Optional for local files: when you omit it the
  helper compares against the pinned release hash below and asks before installing anything else.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-lastbook-plugin.ps1
  (uses the repo's own plugin.js, hash-checked against the pinned release)

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-lastbook-plugin.ps1 -PluginUrl https://example.invalid/plugin.js -ExpectedSha256 37e87ead6dafda3e31a06b1569f1505547ac3db35d39e32141adb801df26406c
#>
[CmdletBinding()]
param(
    [string]$PluginSource,
    [string]$PluginUrl,
    [string]$ExpectedSha256
)

$ErrorActionPreference = 'Stop'

$PluginId     = 'lastbook-guide'
$PluginName   = 'Lastbook - Survival Guide'
$OfficialSite = 'https://lastbook.org'
# Pinned release build (tier 1 plugin.js, 24,432 bytes, 2026-11-19). The README repeats this hash.
$PinnedSha256 = '37e87ead6dafda3e31a06b1569f1505547ac3db35d39e32141adb801df26406c'

function Step([string]$m)  { Write-Host ''; Write-Host "== $m" -ForegroundColor Cyan }
function Note([string]$m)  { Write-Host "   $m" }
function Warn([string]$m)  { Write-Host "   ! $m" -ForegroundColor Yellow }
function Fail([string]$m)  { Write-Host "   x $m" -ForegroundColor Red; exit 1 }

function Confirm-Yes([string]$prompt) {
    # Never block on a prompt that no one can answer (scheduled/redirected runs).
    if (-not [Environment]::UserInteractive) { return $false }
    try {
        $ans = Read-Host "$prompt [y/N]"
    } catch {
        return $false   # no usable console (redirected stdin) -> treat as "no"
    }
    if ($null -eq $ans) { return $false }   # stdin at EOF
    return ($ans -match '^[Yy]')
}

Write-Host ''
Write-Host "$PluginName :: Hermes desktop setup helper (Windows)" -ForegroundColor Green
Write-Host 'Installs the Hermes integration only. Lastbook itself comes only from lastbook.org.'

# ---------------------------------------------------------------- 0. locate plugin.js
Step 'Step 1: find the plugin file to install'
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoDefault = Join-Path (Split-Path -Parent $scriptDir) 'plugin.js'
$downloaded  = $null

if ($PluginUrl -and $PluginSource) { Fail 'give either -PluginSource or -PluginUrl, not both.' }

if ($PluginUrl) {
    if (-not $ExpectedSha256) { Fail '-PluginUrl requires -ExpectedSha256 so the download can be verified. Refusing to install an unverified file.' }
    # HTTPS everywhere, with one exception: a plain-http mirror on this very computer.
    $isLoopbackHttp = $PluginUrl -match '^http://(127\.|localhost:|\[::1\]:)'
    if (-not ($PluginUrl -match '^https://') -and -not $isLoopbackHttp) { Fail 'only https:// URLs (or an http://127.0.0.1 mirror) are accepted for the download.' }
    Note "downloading $PluginUrl"
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072 } catch { }
    $downloaded = Join-Path $env:TEMP ('lastbook-plugin-' + [guid]::NewGuid().ToString('N') + '.js')
    try { Invoke-WebRequest -UseBasicParsing -Uri $PluginUrl -OutFile $downloaded } catch { Fail "download failed: $($_.Exception.Message)" }
    $h = (Get-FileHash -LiteralPath $downloaded -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($h -ne $ExpectedSha256.Trim().ToLowerInvariant()) {
        Remove-Item -LiteralPath $downloaded -ErrorAction SilentlyContinue
        Fail "downloaded file hash is $h but you expected $ExpectedSha256 -- install refused. Nothing was installed."
    }
    $sourcePath = $downloaded
    Note 'download hash matches the expected value.'
} elseif ($PluginSource) {
    if (-not (Test-Path -LiteralPath $PluginSource -PathType Leaf)) { Fail "no file at -PluginSource: $PluginSource" }
    $sourcePath = (Resolve-Path -LiteralPath $PluginSource).Path
} elseif (Test-Path -LiteralPath $repoDefault -PathType Leaf) {
    $sourcePath = $repoDefault
    Note "using the plugin.js that ships beside this helper: $sourcePath"
} else {
    Fail "no plugin.js found beside this helper. Pass -PluginSource <path> or -PluginUrl <url> -ExpectedSha256 <hash>."
}

$sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ExpectedSha256 -and -not $PluginUrl) {
    if ($sourceHash -ne $ExpectedSha256.Trim().ToLowerInvariant()) { Fail "file hash is $sourceHash but you expected $ExpectedSha256 -- install refused." }
} elseif (-not $ExpectedSha256 -and $sourceHash -ne $PinnedSha256) {
    Warn "this file's SHA-256 ($sourceHash) is not the pinned release ($PinnedSha256)."
    if (-not (Confirm-Yes 'Install this other build anyway?')) { Fail 'install cancelled by you. Nothing was changed.' }
} else {
    Note "SHA-256 verified against the pinned release: $sourceHash"
}

# ---------------------------------------------------------------- 1. Hermes desktop home
Step 'Step 2: the Hermes desktop plugin folder'
$hermesHome = Join-Path $env:LOCALAPPDATA 'hermes'
$pluginDir  = Join-Path $hermesHome ('desktop-plugins\' + $PluginId)
Note "installing to: $pluginDir"
Warn 'On Windows the desktop app reads %LOCALAPPDATA%\hermes\desktop-plugins -- NOT %USERPROFILE%\.hermes.'
Warn 'A plugin.js placed in C:\Users\<you>\.hermes\desktop-plugins is invisible to the Windows app.'
$wrongHome = Join-Path $env:USERPROFILE '.hermes\desktop-plugins'
if (Test-Path -LiteralPath $wrongHome) {
    Warn "$wrongHome exists on this machine. Double-check you did not put plugin files there by mistake."
}
try { New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null } catch { Fail "cannot create $pluginDir : $($_.Exception.Message)" }

# ---------------------------------------------------------------- 2. Lastbook: point, never re-release
Step 'Step 3: do you already run Lastbook?'
$found = $null
$uninstallRoots = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
foreach ($root in $uninstallRoots) {
    $hit = Get-ItemProperty $root -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like '*Lastbook*' } | Select-Object -First 1
    if ($hit) { $found = "installed program: $($hit.DisplayName)"; break }
}
if (-not $found) {
    $startMenus = @((Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'),
                    (Join-Path $env:APPDATA   'Microsoft\Windows\Start Menu\Programs'))
    foreach ($sm in $startMenus) {
        $lnk = Get-ChildItem -LiteralPath $sm -Recurse -Filter '*Lastbook*.lnk' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($lnk) { $found = "Start Menu shortcut: $($lnk.Name)"; break }
    }
}
if ($found) {
    Note "Lastbook detected ($found). Good -- you can skip straight to the plugin setup in Hermes."
} else {
    Note 'No Lastbook install was detected on this computer.'
    Write-Host @'

   Lastbook is separate software from lastbook.org. This helper will not download it for you.
   The official way, in order:

     1. Download the signed installer for Windows (64-bit, Windows 10 or later) from
        https://lastbook.org -- it is Authenticode signed by the Lastbook project.
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
                python server.py --data "C:\path\to\LastbookData"
            It answers at http://127.0.0.1:8890 (no key needed there). Add --lan to reach
            other devices; the console prints the exact access link with the key.
        See docs/INSTALL-WINDOWS.md, "Getting a Lastbook URL", for the same steps in prose.
'@ -ForegroundColor Green
    $open = Confirm-Yes ("Open " + $OfficialSite + " in your browser now?")
    if ($open) {
        try { Start-Process $OfficialSite; Note 'opened the official site in your default browser.' }
        catch { Warn "could not open the browser automatically -- visit $OfficialSite yourself." }
    } else {
        Note "skipped. Whenever you are ready, go to $OfficialSite yourself."
    }
}

# ---------------------------------------------------------------- 3. install with backup + read-back
Step 'Step 4: install the plugin file'
$dest = Join-Path $pluginDir 'plugin.js'
if (Test-Path -LiteralPath $dest -PathType Leaf) {
    $destHash = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($destHash -eq $sourceHash) {
        Note 'the identical file is already installed -- nothing to do. (Re-running is always safe.)'
        if ($downloaded) { Remove-Item -LiteralPath $downloaded -ErrorAction SilentlyContinue }
        exit 0
    }
    $bak = "$dest.pre-$($destHash.Substring(0, 8)).bak"
    Copy-Item -LiteralPath $dest -Destination $bak -Force
    Note "kept the previous file as: $bak"
}
Copy-Item -LiteralPath $sourcePath -Destination $dest -Force
$readBack = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant()
if ($readBack -ne $sourceHash) {
    Warn "the file ON DISK hashes to $readBack, not $sourceHash -- something is off."
    Warn "your previous build is still in the .bak file beside it; copy it back by hand if you had one."
    Fail 'install NOT confirmed. Nothing else was changed.'
}
Note "installed and read-back verified: $dest"
Note "SHA-256 on disk: $readBack"
if ($downloaded) { Remove-Item -LiteralPath $downloaded -ErrorAction SilentlyContinue }

# ---------------------------------------------------------------- 4. what to do inside Hermes
Step 'Step 5: finish inside Hermes (two minutes)'
Write-Host @'
  1. In the Hermes desktop app press Ctrl+K and choose "Reload desktop plugins".
     (A new plugin.js on disk stays dormant until a reload or an app restart.)
  2. Check Settings > Plugins: "Lastbook - Survival Guide" should be listed and enabled.
  3. Press Ctrl+K and choose "Lastbook: open survival guide". The panel opens along the
     right side of the window. Paste your Lastbook URL (for example http://127.0.0.1:8890
     or the tailnet address you were given). If someone shares the guide with an access
     link, paste the WHOLE link including ?key= -- the panel splits it for you.
     Press Save. The guide should appear inside the panel.
  4. A small "lastbook" chip in the status bar (bottom right) mirrors the connection:
     filled dot = reachable, key symbol = needs the access key, hollow dot = offline.
'@ -ForegroundColor Green

Write-Host @'
  ONE QUIRK TO KNOW BEFORE YOU CLOSE ANYTHING:
  Closing the plugin's only pane tab DISABLES the plugin (app-owned PluginDecisions in
  the renderer's localStorage -- %APPDATA%\Hermes\Local Storage\leveldb on Windows --
  persists across restarts; the file on disk is untouched).
  Recovery: Ctrl+K -> "Reload desktop plugins", then the lastbook chip (bottom right) or
  Ctrl+K -> "Lastbook: open survival guide" brings the pane back. This is a known Hermes
  gap with an upstream report on file, not a Lastbook or plugin defect. Details in
  docs/TROUBLESHOOTING.md.
'@ -ForegroundColor Yellow

Write-Host ''
Write-Host "Done. Only files written: $dest (plus a .bak of any previous copy)."
Write-Host 'No admin rights were used; nothing was downloaded from anywhere but the URL you gave.'
Write-Host 'Lastbook is MIT-licensed offline survival software by the Lastbook contributors (c) 2026, lastbook.org.'
