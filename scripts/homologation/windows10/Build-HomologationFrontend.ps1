[CmdletBinding()]
param([string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path,
      [string]$ArtifactDirectory = (Join-Path $PSScriptRoot 'artifacts/frontend'))
$ErrorActionPreference = 'Stop'
$frontend = Join-Path $RepositoryRoot 'frontend'
Push-Location $frontend
try {
  npm run build -- --mode homologation
  if ($LASTEXITCODE -ne 0) { throw 'Build homologation do Frontend falhou.' }
  New-Item -ItemType Directory -Force -Path $ArtifactDirectory | Out-Null
  Copy-Item -LiteralPath (Join-Path $frontend 'dist') -Destination (Join-Path $ArtifactDirectory 'dist') -Recurse -Force
  Write-Output "Artefato homologation preparado em $ArtifactDirectory"
} finally { Pop-Location }
