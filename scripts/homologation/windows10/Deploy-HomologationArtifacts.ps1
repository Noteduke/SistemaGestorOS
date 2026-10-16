[CmdletBinding()]
param([string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path,
      [string]$InstallRoot = 'C:\ProgramData\GestorOS\homologation')
$ErrorActionPreference = 'Stop'
$backend = Join-Path $RepositoryRoot 'backend'
if (-not (Test-Path (Join-Path $backend 'dist/main.js'))) { throw 'Compile o Backend (npm run build) antes do staging.' }
$backendTarget = Join-Path $InstallRoot 'backend'
$frontendSource = Join-Path $PSScriptRoot 'artifacts/frontend/dist'
if (-not (Test-Path $frontendSource)) { throw 'Execute Build-HomologationFrontend.ps1 antes do staging.' }
New-Item -ItemType Directory -Force -Path $backendTarget | Out-Null
foreach ($name in @('dist','node_modules','package.json')) {
  $source = Join-Path $backend $name
  if (-not (Test-Path $source)) { throw "Artefato Backend ausente: $name" }
  Copy-Item -LiteralPath $source -Destination $backendTarget -Recurse -Force
}
$frontendTarget = Join-Path $InstallRoot 'frontend/dist'
New-Item -ItemType Directory -Force -Path (Split-Path $frontendTarget) | Out-Null
New-Item -ItemType Directory -Force -Path $frontendTarget | Out-Null
Copy-Item -Path (Join-Path $frontendSource '*') -Destination $frontendTarget -Recurse -Force
Write-Output 'Artefatos copiados. Preserve config, arquivos, logos e backups nos diretórios persistentes.'
