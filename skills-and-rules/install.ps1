# Links this library into Claude Code and Antigravity so there is ONE copy of every skill and rule.
# Re-run after adding a skill. Safe to re-run. Backup of the old copies: ~\skills-backup-2026-09-27.zip
$ErrorActionPreference = "Stop"
$lib = $PSScriptRoot
$claude = Join-Path $HOME ".claude\skills"
$gemini = Join-Path $HOME ".gemini\config\skills"
$geminiRules = Join-Path $HOME ".gemini\config\rules"
$plugin = Join-Path $HOME ".gemini\config\plugins\anti-human"

# Old studio skills that were merged or deleted in the 2026-09-27 cleanup
$retired = "kinetic-typography-catalog","motion-style-catalog","scene-director-catalog","sfx-and-transitions",
           "theaf","wan21-video","master-theaf","motion-designer","video-production-standard"

function Link($target, $link) {
  if (Test-Path $link) { Remove-Item $link -Recurse -Force }
  New-Item -ItemType Junction -Path $link -Target $target | Out-Null
}

foreach ($dir in $claude, $gemini) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  foreach ($r in $retired) { $p = Join-Path $dir $r; if (Test-Path $p) { Remove-Item $p -Recurse -Force; "removed $p" } }
  Get-ChildItem (Join-Path $lib "skills") -Directory | ForEach-Object { Link $_.FullName (Join-Path $dir $_.Name); "linked $($_.Name) -> $dir" }
}

# Antigravity: Remotion skills point at the one npx-managed copy in ~\.agents\skills
Get-ChildItem (Join-Path $HOME ".agents\skills") -Directory -Filter "remotion-*" | ForEach-Object { Link $_.FullName (Join-Path $gemini $_.Name) }

# Antigravity rules = this library's rules folder
if (Test-Path $geminiRules) { Remove-Item $geminiRules -Recurse -Force }
New-Item -ItemType Junction -Path $geminiRules -Target (Join-Path $lib "rules") | Out-Null
"linked rules -> $geminiRules"

# The anti-human plugin held duplicate copies of everything; empty it
foreach ($sub in "skills","rules") { $p = Join-Path $plugin $sub; if (Test-Path $p) { Remove-Item $p -Recurse -Force; "emptied $p" } }
"done"
