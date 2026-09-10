$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot
docker compose up -d

# The tunnel was configured once with its private token and is restarted here
# without storing that token in this script or in the repository.
docker start sdg_ngrok 2>$null
Start-Sleep -Seconds 3

$tunnel = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 15
$publicUrl = $tunnel.tunnels[0].public_url

if (-not $publicUrl) {
    throw "ngrok started, but no public URL was returned. Run: docker logs sdg_ngrok"
}

Write-Host "Demo website is ready: $publicUrl" -ForegroundColor Green
Read-Host "Copy the link above, then press Enter to close this window"
