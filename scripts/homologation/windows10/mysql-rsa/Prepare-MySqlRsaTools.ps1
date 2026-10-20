[CmdletBinding(SupportsShouldProcess=$true)]
param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ReleaseCommit,
 [Parameter(Mandatory=$true)][string]$PackagePath,
 [Parameter(Mandatory=$true)][string]$UpdaterPath,
 [Parameter(Mandatory=$true)][string]$Destination
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$head=(& git -C $repo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -cne $ReleaseCommit) { throw 'HEAD nao corresponde ao commit de release autorizado.' }
$scope=@('backend','frontend','scripts/homologation/windows10/mysql-rsa','scripts/homologation/windows10/MySQL-Authentication.md')
$dirty=@(& git -C $repo status --porcelain --untracked-files=all -- @scope)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -ne 0) { throw 'Fontes da aplicacao/RSA devem estar versionadas e sem alteracoes no escopo.' }
$artifactRoot=[IO.Path]::GetFullPath((Join-Path $repo 'scripts/homologation/windows10/artifacts')).TrimEnd('\')+'\'
$dest=[IO.Path]::GetFullPath($Destination)
if (-not $dest.StartsWith($artifactRoot,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $dest)) { throw 'Destino deve ser novo, local e dentro de artifacts.' }
$ancestor=Split-Path -Parent $dest
while ($ancestor) {
 if ((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Reparse point no destino de preparacao.' }
 $parent=Split-Path -Parent $ancestor; if ($parent -eq $ancestor) { break }; $ancestor=$parent
}
if ((Get-FileHash -LiteralPath $UpdaterPath -Algorithm SHA256).Hash -cne '20933130F9A6D3C923C9C59F0DC74EE521A7EFFFC837A47679202F0C33CF9B48') { throw 'Atualizador diferente do revisado.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($PackagePath))
try {
 $reader=New-Object IO.StreamReader($zip.GetEntry('release-manifest.json').Open())
 try { $manifest=$reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
 if ($manifest.sourceCommit -cne $ReleaseCommit -or $manifest.environment -cne 'homologation' -or $manifest.releaseType -cne 'complete-runtime-update') { throw 'ZIP nao pertence ao novo commit/ambiente/runtime.' }
 $reader=New-Object IO.StreamReader($zip.GetEntry('backend/dist/infrastructure/prisma/mysql-connection-options.js').Open())
 try { $compiled=$reader.ReadToEnd() } finally { $reader.Dispose() }
 if (-not $compiled.Contains('RSA PUBLIC KEY') -or -not $compiled.Contains('allowPublicKeyRetrieval: false')) { throw 'ZIP nao contem a correcao RSA compilada.' }
} finally { $zip.Dispose() }
$files=@('Check-MySqlRsa.mjs','Set-MySqlRsaConfiguration.ps1','Test-MySqlRsaReadOnly.ps1','Diagnose-MySqlRsaPrecheck.ps1','Diagnose-MySqlRsaPrecheck.mjs')
foreach ($name in $files) { if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $name) -PathType Leaf)) { throw 'Auxiliar ausente.' } }
if ($WhatIfPreference) { Write-Output 'WhatIf: nenhuma pasta/arquivo criado; nenhum banco, servico ou configuracao acessado.'; return }
if (-not $PSCmdlet.ShouldProcess($dest,'Preparar auxiliares e manifesto para ZIP de commit autorizado, sem implantar')) { return }
[void][IO.Directory]::CreateDirectory($dest)
foreach ($name in $files) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $dest $name) }
Copy-Item -LiteralPath $PackagePath -Destination (Join-Path $dest 'GestorOS-Homologation1-runtime.zip')
Copy-Item -LiteralPath $UpdaterPath -Destination (Join-Path $dest 'Update-HomologationRelease-20933130.ps1')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.md') -Destination (Join-Path $dest 'README.md')
$encoding=New-Object Text.UTF8Encoding($false)
$context=[ordered]@{ status='ready'; clean=$true; sourceCommit=$ReleaseCommit; packageSha256=(Get-FileHash -LiteralPath $PackagePath).Hash }
[IO.File]::WriteAllText((Join-Path $dest 'Release-Context.json'),($context | ConvertTo-Json),$encoding)
$lines=@(Get-ChildItem -LiteralPath $dest -File | Sort-Object Name | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName).Hash+'  '+$_.Name })
[IO.File]::WriteAllText((Join-Path $dest 'SHA256SUMS-DEPLOYMENT.txt'),(($lines -join "`r`n")+"`r`n"),$encoding)
Write-Output ('Auxiliares preparados para '+$ReleaseCommit+'. Nenhuma implantacao ou conexao executada.')
