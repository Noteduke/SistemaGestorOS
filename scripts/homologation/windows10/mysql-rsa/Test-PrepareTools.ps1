[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('GestorOS-RsaPrepareTests-'+[guid]::NewGuid().ToString('N'))
$encoding=New-Object Text.UTF8Encoding($false)
$global:RsaFixtureCommit='1111111111111111111111111111111111111111'
$global:RsaFixtureDirty=$false
function git {
 $global:LASTEXITCODE=0
 if ($args -contains 'rev-parse') { return $global:RsaFixtureCommit }
 if ($args -contains 'status') { if ($global:RsaFixtureDirty) { return ' M synthetic.ts' }; return }
 throw 'Unexpected git invocation in fixture.'
}
function Assert-Test([bool]$Value,[string]$Message) { if (-not $Value) { throw $Message } }
try {
 [void][IO.Directory]::CreateDirectory($root)
 $tools=Join-Path $root 'scripts/homologation/windows10/mysql-rsa'
 [void][IO.Directory]::CreateDirectory($tools)
 foreach ($name in @('MysqlDiagnosticOutput.ps1','PRIMEIRO-LOGIN-RSA.md','Test-MySqlRsaStaged.ps1','Prepare-MySqlRsaTools.ps1','Check-MySqlRsa.mjs','Set-MySqlRsaConfiguration.ps1','Test-MySqlRsaReadOnly.ps1','Diagnose-MySqlRsaPrecheck.ps1','Diagnose-MySqlRsaPrecheck.mjs','README.md')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $tools $name) }
 $updater=Join-Path (Split-Path -Parent $PSScriptRoot) 'Update-HomologationRelease-20933130.ps1'
 $payload=Join-Path $root 'synthetic-payload'; [void][IO.Directory]::CreateDirectory((Join-Path $payload 'backend/dist/infrastructure/prisma'))
 [IO.File]::WriteAllText((Join-Path $payload 'release-manifest.json'),'{"sourceCommit":"1111111111111111111111111111111111111111","environment":"homologation","releaseType":"complete-runtime-update"}',$encoding)
 [IO.File]::WriteAllText((Join-Path $payload 'backend/dist/infrastructure/prisma/mysql-connection-options.js'),'// Synthetic test only: normalizePinnedRsaPublicKey; RSA PUBLIC KEY; allowPublicKeyRetrieval: false',$encoding)
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 Add-Type -AssemblyName System.IO.Compression
 $zip=Join-Path $root 'synthetic.zip'
 [void][IO.Directory]::CreateDirectory((Join-Path $payload 'backend/dist/scripts'))
 [IO.File]::WriteAllText((Join-Path $payload 'backend/dist/scripts/diagnose-homologation-mysql.js'),'// synthetic non-executable diagnostic fixture',$encoding)
 $archive=[IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create)
 try { foreach ($relative in @('release-manifest.json','backend/dist/infrastructure/prisma/mysql-connection-options.js','backend/dist/scripts/diagnose-homologation-mysql.js')) { [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $payload $relative),$relative) } }
 finally { $archive.Dispose() }
 $prepare=Join-Path $tools 'Prepare-MySqlRsaTools.ps1'
 $dest=Join-Path $root 'scripts/homologation/windows10/artifacts/synthetic-delivery'
 & $prepare -ReleaseCommit $global:RsaFixtureCommit -PackagePath $zip -UpdaterPath $updater -Destination $dest -WhatIf
 Assert-Test (-not (Test-Path -LiteralPath $dest)) 'WhatIf created a directory.'
 $global:RsaFixtureDirty=$true
 $refused=$false
 try { & $prepare -ReleaseCommit $global:RsaFixtureCommit -PackagePath $zip -UpdaterPath $updater -Destination $dest -WhatIf } catch { $refused=$true }
 Assert-Test ($refused -and -not (Test-Path -LiteralPath $dest)) 'Dirty source accepted.'
 $global:RsaFixtureDirty=$false
 $refused=$false
 try { & $prepare -ReleaseCommit ('2'*40) -PackagePath $zip -UpdaterPath $updater -Destination $dest -WhatIf } catch { $refused=$true }
 Assert-Test ($refused -and -not (Test-Path -LiteralPath $dest)) 'Wrong HEAD accepted.'
 & $prepare -ReleaseCommit $global:RsaFixtureCommit -PackagePath $zip -UpdaterPath $updater -Destination $dest -Confirm:$false
 $context=[IO.File]::ReadAllText((Join-Path $dest 'Release-Context.json')) | ConvertFrom-Json
 Assert-Test ($context.sourceCommit -ceq $global:RsaFixtureCommit -and $context.status -ceq 'ready' -and $context.clean) 'Generated context mismatch.'
 $count=0
 foreach ($line in [IO.File]::ReadAllLines((Join-Path $dest 'SHA256SUMS-DEPLOYMENT.txt'))) {
  if ($line -notmatch '^([A-F0-9]{64})  ([A-Za-z0-9_.-]+)$') { throw 'Invalid generated manifest.' }
  $hash=$Matches[1]; $file=Join-Path $dest $Matches[2]
  Assert-Test ((Get-FileHash -LiteralPath $file).Hash -ceq $hash) 'Generated hash mismatch.'; $count++
 }
 Assert-Test ($count -eq 12) 'Unexpected deployment whitelist.'
 $refused=$false
 try { & $prepare -ReleaseCommit $global:RsaFixtureCommit -PackagePath $zip -UpdaterPath $updater -Destination $dest } catch { $refused=$true }
 Assert-Test $refused 'Existing delivery overwritten.'
 Write-Output 'PASS: mocked Git (no commit), synthetic ZIP, provenance refusal, WhatIf, delivery generation, twelve hashes and no overwrite.'
} finally {
 $absolute=[IO.Path]::GetFullPath($root); $prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
 if (-not $absolute.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($absolute) -notmatch '^GestorOS-RsaPrepareTests-[a-f0-9]{32}$') { throw 'Unsafe cleanup.' }
 if (Test-Path -LiteralPath $absolute) { Remove-Item -LiteralPath $absolute -Recurse -Force -Confirm:$false }
}
