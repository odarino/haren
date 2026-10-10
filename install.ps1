# haren installer for Windows (PowerShell 5.1+).
#   irm https://raw.githubusercontent.com/odarino/haren/main/install.ps1 | iex
# Pin a version:  $env:HAREN_VERSION = '1.2.0'; irm ... | iex
& {
  $ErrorActionPreference = 'Stop'

  function Write-Info([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }

  $version = if ($env:HAREN_VERSION) { $env:HAREN_VERSION } else { 'latest' }

  if (-not [Environment]::Is64BitOperatingSystem) {
    throw 'haren needs 64-bit Windows.'
  }

  if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Info 'Installing Bun (https://bun.sh)'
    powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
    if ($LASTEXITCODE -ne 0) { throw "The Bun installer failed with exit code $LASTEXITCODE. Install Bun from https://bun.sh and run this script again." }
    $bunHome = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { "$env:USERPROFILE\.bun" }
    $env:Path = "$bunHome\bin;$env:Path"
  }
  if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    throw 'Bun is not on PATH after install. Open a new terminal and run this script again.'
  }

  Write-Info "Installing @odarino/haren@$version"
  bun add -g "@odarino/haren@$version"
  if ($LASTEXITCODE -ne 0) { throw "bun add failed with exit code $LASTEXITCODE." }

  # Always run the haren that bun just installed: an older one (npm i -g) may come first on PATH.
  $bunBin = "$(bun pm bin -g | Select-Object -Last 1)".Trim()
  if (-not $bunBin) {
    $bunBin = if ($env:BUN_INSTALL) { "$env:BUN_INSTALL\bin" } else { "$env:USERPROFILE\.bun\bin" }
  }
  $onPath = Get-Command haren -ErrorAction SilentlyContinue | Select-Object -First 1
  $findHaren = {
    Get-Command haren -All -ErrorAction SilentlyContinue |
      Where-Object { $_.Source -and $_.Source.StartsWith($bunBin, [StringComparison]::OrdinalIgnoreCase) } |
      Select-Object -First 1
  }
  $harenCmd = & $findHaren
  if (-not $harenCmd) {
    $env:Path = "$bunBin;$env:Path"
    $harenCmd = & $findHaren
  }
  if (-not $harenCmd) {
    throw "haren was not found in $bunBin after bun add. Run: bun add -g @odarino/haren"
  }
  if (-not $onPath -or $onPath.Source -ne $harenCmd.Source) {
    Write-Info "Add this folder to the start of your user PATH: $bunBin"
  }

  # CI counts only when it is set to something other than "", false or 0 (any case).
  $isCI = $env:CI -and $env:CI.Trim() -notmatch '^(false|0)?$'
  if ($isCI -or [Console]::IsInputRedirected -or -not [Environment]::UserInteractive) {
    Write-Info 'Installed. Next: cd <your workspace>; haren init'
    return
  }

  $answer = Read-Host "Workspace path [$PWD]"
  # Enter from the home folder would make ~ the workspace. Ask once more instead.
  if (-not "$answer".Trim() -and "$PWD".TrimEnd('\', '/') -eq "$HOME".TrimEnd('\', '/')) {
    $answer = Read-Host 'Workspace path (a project folder, not your home folder)'
  }
  $answer = "$answer".Trim().Trim('"')
  $workspace = if ($answer) { $answer } else { "$PWD" }
  if ($workspace -eq '~') {
    $workspace = $HOME
  } elseif ($workspace.StartsWith('~\') -or $workspace.StartsWith('~/')) {
    $workspace = (Join-Path $HOME $workspace.Substring(2)).TrimEnd('\', '/')
  } elseif ($workspace.StartsWith('~')) {
    throw "Use a full path, for example C:\Users\$($workspace.Substring(1))"
  }

  & $harenCmd.Source init --dir $workspace
}
