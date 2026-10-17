# Evil Genius V2 - local launcher
# Starts the V2 game server on 127.0.0.1:8791 using the evil-genius venv.
# Leaves v1 (port 8787) and the Strands Decider (port 8099) alone.
[CmdletBinding()]
param(
  [int]$Port = 8791,
  [string]$VenvPython = 'D:\AI\evil-genius-venv\Scripts\python.exe',
  [string]$RepoRoot = 'D:\Repos\evil-genius-v2',
  [string]$DeciderUrl = 'http://127.0.0.1:8099',
  [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'

function Test-PortListening([int]$p) {
  try { return [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop) }
  catch { return $false }
}

function Stop-PortOwner([int]$p) {
  $owners = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($opid in $owners) {
    Write-Host "  killing PID $opid holding port $p"
    try { Stop-Process -Id $opid -Force -ErrorAction Stop }
    catch {
      # Fallback for processes owned by another elevation context
      Start-Process -Verb RunAs -FilePath taskkill -ArgumentList '/F','/PID',$opid -Wait -WindowStyle Hidden
    }
  }
  Start-Sleep -Seconds 1
}

Write-Host "[1/5] Checks" -ForegroundColor Cyan
if (-not (Test-Path $VenvPython)) { throw "Venv python not found: $VenvPython" }
if (-not (Test-Path (Join-Path $RepoRoot 'backend\server.py'))) { throw "Repo not found: $RepoRoot" }

Write-Host "[2/5] Ensure boto3 in venv"
& $VenvPython -c "import boto3" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "  installing boto3..."
  & $VenvPython -m pip install --quiet boto3
}

Write-Host "[3/5] Decider on 8099"
if (Test-PortListening 8099) {
  Write-Host "  Strands Decider already listening - reusing it." -ForegroundColor Green
} else {
  Write-Warning "  Decider NOT listening on 8099. AI picks will fall back to deterministic path."
}

Write-Host "[4/5] Freeing port $Port if stale"
if (Test-PortListening $Port) {
  if ($Port -eq 8787) { throw "Refusing to touch v1 port 8787." }
  Stop-PortOwner $Port
  if (Test-PortListening $Port) { throw "Port $Port still occupied." }
}

Write-Host "[5/5] Starting V2 server on http://127.0.0.1:$Port/" -ForegroundColor Cyan
$logDir = Join-Path $RepoRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$log    = Join-Path $logDir "server-$stamp.log"

$env:PORT = "$Port"
$env:STRANDS_DECIDER_URL = $DeciderUrl

$wrapper = Join-Path $logDir '_run-server.cmd'
@"
@echo off
cd /d "$(Join-Path $RepoRoot 'backend')"
set PORT=$Port
set STRANDS_DECIDER_URL=$DeciderUrl
"$VenvPython" "$(Join-Path $RepoRoot 'backend\server.py')" > "$log" 2>&1
"@ | Set-Content -Path $wrapper -Encoding ASCII

$proc = Start-Process -FilePath $wrapper -WindowStyle Hidden -PassThru

# Wait up to 10s for the port to come up
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-PortListening $Port) { break }
}
if (-not (Test-PortListening $Port)) {
  Write-Host "--- server log ---"; Get-Content $log -ErrorAction SilentlyContinue
  throw "Server failed to bind $Port. See $log"
}

try {
  $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 5
  if ($r.StatusCode -ne 200) { throw "Unexpected status $($r.StatusCode)" }
} catch {
  throw "Server bound but not responding: $_"
}

Write-Host ""
Write-Host "  Evil Genius V2 is live:  http://127.0.0.1:$Port/" -ForegroundColor Green
Write-Host "  PID $($proc.Id)   log: $log"
Write-Host "  Try: http://127.0.0.1:$Port/?seed=playtest"
Write-Host ""
if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$Port/?seed=playtest" }
