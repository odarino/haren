# haren installer for Windows (PowerShell 5.1+).
#   irm https://raw.githubusercontent.com/odarino/haren/main/install.ps1 | iex
# Pin a version:  $env:HAREN_VERSION = '1.2.0'; irm ... | iex
$ErrorActionPreference = 'Stop'

function Write-Info([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }

& {
  $version = if ($env:HAREN_VERSION) { $env:HAREN_VERSION } else { 'latest' }

  if (-not [Environment]::Is64BitOperatingSystem) {
    throw 'haren needs 64-bit Windows.'
  }

  if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Info 'Installing Bun (https://bun.sh)'
    powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
    $env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
  }
  if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    throw 'Bun is not on PATH after install. Open a new terminal and run this script again.'
  }

  Write-Info "Installing @odarino/haren@$version"
  bun add -g "@odarino/haren@$version"
  if ($LASTEXITCODE -ne 0) { throw "bun add failed with exit code $LASTEXITCODE." }

  if (-not (Get-Command haren -ErrorAction SilentlyContinue)) {
    $bunBin = (bun pm bin -g).Trim()
    $env:Path = "$bunBin;$env:Path"
    Write-Info "Add this folder to your user PATH: $bunBin"
  }

  if ($env:CI -or [Console]::IsInputRedirected -or -not [Environment]::UserInteractive) {
    Write-Info 'Installed. Next: cd <your workspace>; haren init'
    return
  }

  $answer = Read-Host "Workspace path [$PWD]"
  $workspace = if ($answer) { $answer } else { "$PWD" }
  if ($workspace -eq '~' -or $workspace.StartsWith('~\') -or $workspace.StartsWith('~/')) {
    $workspace = Join-Path $HOME $workspace.Substring([Math]::Min(2, $workspace.Length))
  }

  haren init --dir $workspace
}
