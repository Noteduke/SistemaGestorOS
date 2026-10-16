[CmdletBinding()]
param([string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path,
      [string]$InstallRoot = 'C:\ProgramData\GestorOS\homologation',
      [string]$ArtifactDirectory = (Join-Path $PSScriptRoot 'artifacts/frontend'))
$ErrorActionPreference = 'Stop'
$backend = Join-Path $RepositoryRoot 'backend'
if (-not (Test-Path (Join-Path $backend 'dist/main.js'))) { throw 'Compile o Backend (npm run build) antes do staging.' }
$backendTarget = Join-Path $InstallRoot 'backend'
$artifactRoot = [System.IO.Path]::GetFullPath($ArtifactDirectory)
$frontendSource = Join-Path $artifactRoot 'dist'
if (-not (Test-Path $frontendSource)) { throw 'Execute Build-HomologationFrontend.ps1 antes do staging.' }
$manifestPath = Join-Path $artifactRoot 'build-info.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'Manifesto do build ausente; artefato não identificado e recusado.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.environment -ne 'homologation' -or -not $manifest.homologationMarkerVerified -or -not $manifest.sourceCommit -or -not $manifest.frontendVersion) {
  throw 'Manifesto não confirma build homologation válido; deploy recusado.'
}
$frontendBundles = @(Get-ChildItem -LiteralPath $frontendSource -Recurse -File | Where-Object Extension -in @('.js', '.css'))
$markerFound = $false
foreach ($bundle in $frontendBundles) {
  if (Select-String -LiteralPath $bundle.FullName -SimpleMatch -Pattern 'DOCUMENTO DE TESTE — HOMOLOGAÇÃO' -Quiet) { $markerFound = $true; break }
}
if (-not $markerFound) {
  throw 'Artefato não contém a identificação obrigatória de homologação; deploy recusado.'
}
New-Item -ItemType Directory -Force -Path $backendTarget | Out-Null
foreach ($name in @('dist','node_modules','package.json')) {
  $source = Join-Path $backend $name
  if (-not (Test-Path $source)) { throw "Artefato Backend ausente: $name" }
  Copy-Item -LiteralPath $source -Destination $backendTarget -Recurse -Force
}
$frontendRoot = Join-Path $InstallRoot 'frontend'
$frontendTarget = Join-Path $frontendRoot 'dist'
New-Item -ItemType Directory -Force -Path $frontendRoot | Out-Null
New-Item -ItemType Directory -Force -Path $frontendTarget | Out-Null
Copy-Item -Path (Join-Path $frontendSource '*') -Destination $frontendTarget -Recurse -Force
Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $frontendRoot 'build-info.json') -Force
Write-Output "Artefatos copiados: Frontend homologation v$($manifest.frontendVersion), commit $($manifest.sourceCommit). Preserve config, arquivos, logos e backups nos diretórios persistentes."
