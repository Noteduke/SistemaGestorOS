[CmdletBinding()]
param([string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path,
      [string]$ArtifactDirectory = (Join-Path $PSScriptRoot 'artifacts/frontend'))
$ErrorActionPreference = 'Stop'
$rules = Import-PowerShellDataFile (Join-Path $PSScriptRoot '../../../tools/gestoros-diagnostico/Homologation.Rules.psd1')
$frontend = Join-Path $RepositoryRoot 'frontend'
Push-Location $frontend
try {
  npm run build -- --mode homologation
  if ($LASTEXITCODE -ne 0) { throw 'Build homologation do Frontend falhou.' }
  $dist = Join-Path $frontend 'dist'
  $bundles = @(Get-ChildItem -LiteralPath $dist -Recurse -File | Where-Object Extension -in @('.js', '.css'))
  $marker = $rules.Marker
  $markerFound = $false
  foreach ($bundle in $bundles) {
    if (Select-String -LiteralPath $bundle.FullName -SimpleMatch -Pattern $marker -Quiet) { $markerFound = $true; break }
  }
  if (-not $markerFound) {
    throw 'O bundle compilado não contém a identificação obrigatória de homologação; artefato recusado.'
  }

  $package = Get-Content -LiteralPath (Join-Path $frontend 'package.json') -Raw | ConvertFrom-Json
  $commit = (& git -C $RepositoryRoot rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $commit) { throw 'Não foi possível identificar o commit de origem do build.' }
  $manifest = [ordered]@{
    application = 'Sistema Gestor OS'
    environment = 'homologation'
    frontendVersion = $package.version
    sourceCommit = $commit
    builtAtUtc = [DateTime]::UtcNow.ToString('o')
    homologationMarkerVerified = $true
  }

  $artifactRoot = [System.IO.Path]::GetFullPath($ArtifactDirectory)
  $artifactDist = Join-Path $artifactRoot 'dist'
  New-Item -ItemType Directory -Force -Path $artifactDist | Out-Null
  Get-ChildItem -LiteralPath $dist -Force | Copy-Item -Destination $artifactDist -Recurse -Force
  $manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $artifactRoot 'build-info.json') -Encoding utf8
  Write-Output "Artefato homologation v$($package.version), commit $commit, marcador verificado. Diretório: $artifactRoot"
} finally { Pop-Location }
