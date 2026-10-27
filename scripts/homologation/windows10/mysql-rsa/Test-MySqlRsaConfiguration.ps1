[CmdletBinding()]
param([ValidateSet('spki','pkcs1')][string]$KeyFormat='spki',[switch]$TerminalNul)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('GestorOS-RsaProcedureTests-'+[guid]::NewGuid().ToString('N'))
$utf8=New-Object Text.UTF8Encoding($false)
function Assert-Test([bool]$Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
function Snapshot([string]$Path) {
  return (@(Get-ChildItem -LiteralPath $Path -File -Force -Recurse | Sort-Object FullName | ForEach-Object { $_.FullName+'|'+(Get-FileHash -LiteralPath $_.FullName).Hash+'|'+(Get-Acl -LiteralPath $_.FullName).Sddl }) -join "`n")
}
try {
  [void][IO.Directory]::CreateDirectory($root)
  $fixtureAcl=Get-Acl -LiteralPath $root
  $fixtureAcl.SetAccessRuleProtection($true,$false)
  foreach ($fixtureSid in @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')) {
    $fixtureAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($fixtureSid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
  }
  Set-Acl -LiteralPath $root -AclObject $fixtureAcl -Confirm:$false
  $config=Join-Path $root 'config'; [void][IO.Directory]::CreateDirectory((Join-Path $config 'mysql'))
  $backend=Join-Path $root 'backend'; [void][IO.Directory]::CreateDirectory($backend)
  $node=(Get-Command node.exe).Source
  $keyFixture=Join-Path $root 'generate-synthetic.mjs'
  [IO.File]::WriteAllText($keyFixture,'import {generateKeyPairSync} from "node:crypto"; import fs from "node:fs"; fs.writeFileSync(process.argv[2],generateKeyPairSync("rsa",{modulusLength:2048}).publicKey.export({type:process.argv[3],format:"pem"}));',$utf8)
  & $node $keyFixture (Join-Path $config 'mysql/caching-sha2-public.pem') $KeyFormat
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic key generation failed.' }
  if ($TerminalNul) {
    $publicFixture=Join-Path $config 'mysql/caching-sha2-public.pem'
    [byte[]]$terminatedKey=@([IO.File]::ReadAllBytes($publicFixture))+@([byte]0)
    [IO.File]::WriteAllBytes($publicFixture,$terminatedKey)
  }
  $hash=(Get-FileHash -LiteralPath (Join-Path $config 'mysql/caching-sha2-public.pem')).Hash
  [IO.File]::WriteAllText((Join-Path $backend 'runtime-info.json'),'{"sourceCommit":"previous-synthetic"}',$utf8)
  $source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Set-MySqlRsaConfiguration.ps1'))
  $companion=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Check-MySqlRsa.mjs'))
  # Rebase fixed paths ONLY into a newly created disposable tree; never invoke service/database commands.
  $source=$source.Replace('C:\ProgramData\GestorOS\homologation',$root).Replace('C:/ProgramData/GestorOS/homologation',$root.Replace('\','/')).Replace('C:\Program Files\nodejs\node.exe',$node)
  $companion=$companion.Replace('C:/ProgramData/GestorOS/homologation',$root.Replace('\','/'))
  $source=$source.Replace('9C2384DBD2B09A2CCE97D276A7ECAB92B565B9FA15978162C82EFAFB90A8C73B',$hash)
  $companion=$companion.Replace('9C2384DBD2B09A2CCE97D276A7ECAB92B565B9FA15978162C82EFAFB90A8C73B',$hash)
  # Administrative token/ownership checks remain in delivery. Fixture uses its current owner, without elevation.
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $source=$source.Replace("@('S-1-5-18','S-1-5-32-544')",("@('S-1-5-18','S-1-5-32-544','"+$sid+"')"))
  $source=$source.Replace("SecurityIdentifier('S-1-5-32-544')",("SecurityIdentifier('"+$sid+"')"))
  $source=$source.Replace('  Assert-Administrator',"  # Fixture only: no elevation needed for disposable files")
  $source=$source.Replace("  Write-Error 'Operacao interrompida.", "  Write-Host ('FIXTURE_ONLY_FAILURE: '+`$_.Exception.Message+' '+`$_.ScriptStackTrace)`r`n  Write-Error 'Operacao interrompida.")
  $script=Join-Path $root 'Set-MySqlRsaConfiguration.ps1'
  [IO.File]::WriteAllText($script,$source,$utf8)
  [IO.File]::WriteAllText((Join-Path $root 'Check-MySqlRsa.mjs'),$companion,$utf8)
  [IO.File]::WriteAllText((Join-Path $root 'Release-Context.json'),'{"status":"ready","clean":true,"sourceCommit":"1111111111111111111111111111111111111111"}',$utf8)
  $env=Join-Path $config '.env.homologation'
  $original="DATABASE_URL=mysql://gos_homologation_app:synthetic%40value@127.0.0.1:3306/gestor_os_homologation`r`nGOS_DEPLOYMENT_ENV=homologation`r`nGOS_DATABASE_TARGET=gestor_os_homologation`r`nGOS_EXTERNAL_EFFECTS_ENABLED=false`r`nUNRELATED_VALUE=preserve-me`r`n"
  [IO.File]::WriteAllText($env,$original,(New-Object Text.UTF8Encoding($true)))
  $originalHash=(Get-FileHash -LiteralPath $env).Hash
  $originalAcl=(Get-Acl -LiteralPath $env).Sddl
  $before=Snapshot $root
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Action Configure -WhatIf
  Assert-Test ($LASTEXITCODE -eq 0 -and (Snapshot $root) -ceq $before) 'WhatIf modified fixture files or ACLs.'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '$script' -Action Configure -Confirm:`$false"
  Assert-Test ($LASTEXITCODE -eq 0) 'Configuration fixture failed.'
  $backups=@(Get-ChildItem -LiteralPath $config -Directory -Filter 'mysql-rsa-backup-*')
  Assert-Test ($backups.Count -eq 1) 'Expected exactly one protected backup.'
  $backup=$backups[0].FullName
  Assert-Test ((Get-FileHash -LiteralPath (Join-Path $backup 'original.env')).Hash -ceq $originalHash) 'Backup not byte-identical.'
  Assert-Test ((Get-Acl -LiteralPath $backup).AreAccessRulesProtected) 'Backup ACL not protected.'
  Assert-Test ((Get-Acl -LiteralPath $env).Sddl -ceq $originalAcl) 'Config ACL changed.'
  Assert-Test ([IO.File]::ReadAllText($env).Contains('UNRELATED_VALUE=preserve-me')) 'Unrelated data changed.'
  Assert-Test ([IO.File]::ReadAllText($env).Contains('DATABASE_URL=mysql://gos_homologation_app:synthetic%40value@127.0.0.1:3306/gestor_os_homologation')) 'Synthetic credentials changed.'
  $configuredHash=(Get-FileHash -LiteralPath $env).Hash
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '$script' -Action Configure -Confirm:`$false"
  Assert-Test ($LASTEXITCODE -eq 0 -and @(Get-ChildItem -LiteralPath $config -Directory -Filter 'mysql-rsa-backup-*').Count -eq 1) 'Configure not idempotent.'
  [IO.File]::AppendAllText($env,"# subsequent administrative edit`r`n")
  $ErrorActionPreference='Continue'
  try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '$script' -Action Restore -BackupDirectory '$backup' -PreviousApplicationVerified -Confirm:`$false" 2>$null }
  finally { $ErrorActionPreference='Stop' }
  Assert-Test ($LASTEXITCODE -ne 0) 'Restore overwrote a later config change.'
  # Restore synthetic edited file to exact known configured bytes for remaining fixture checks.
  $changed=[IO.File]::ReadAllText($env).Replace("# subsequent administrative edit`r`n",'')
  [IO.File]::WriteAllText($env,$changed,(New-Object Text.UTF8Encoding($true)))
  Assert-Test ((Get-FileHash -LiteralPath $env).Hash -ceq $configuredHash) 'Fixture reset mismatch.'
  $runtime=Join-Path $backend 'runtime-info.json'
  [IO.File]::WriteAllText($runtime,'{"sourceCommit":"wrong-synthetic-runtime"}',$utf8)
  $ErrorActionPreference='Continue'
  try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '$script' -Action Restore -BackupDirectory '$backup' -PreviousApplicationVerified -Confirm:`$false" 2>$null }
  finally { $ErrorActionPreference='Stop' }
  Assert-Test ($LASTEXITCODE -ne 0 -and (Get-FileHash -LiteralPath $env).Hash -ceq $configuredHash) 'Restore accepted wrong runtime.'
  [IO.File]::WriteAllText($runtime,'{"sourceCommit":"previous-synthetic"}',$utf8)
  # Do not allow a backup containing synthetic credentials to become readable by Everyone.
  $backupFile=Join-Path $backup 'original.env'
  $savedBackupAcl=Get-Acl -LiteralPath $backupFile
  $unsafeAcl=Get-Acl -LiteralPath $backupFile
  $unsafeAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-1-0')),'Read','Allow')))
  Set-Acl -LiteralPath $backupFile -AclObject $unsafeAcl -Confirm:$false
  $ErrorActionPreference='Continue'
  try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '$script' -Action Restore -BackupDirectory '$backup' -PreviousApplicationVerified -Confirm:`$false" 2>$null }
  finally { $ErrorActionPreference='Stop' }
  Assert-Test ($LASTEXITCODE -ne 0 -and (Get-FileHash -LiteralPath $env).Hash -ceq $configuredHash) 'Restore accepted public-readable credential backup.'
  Set-Acl -LiteralPath $backupFile -AclObject $savedBackupAcl -Confirm:$false
  # A broken/missing public key must block configuration, but must not block recovery of the old config.
  $fixturePublic=Join-Path $config 'mysql/caching-sha2-public.pem'
  [IO.File]::WriteAllText($fixturePublic,'invalid-public-fixture',$utf8)
  $ErrorActionPreference='Continue'
  try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Action Check 2>$null }
  finally { $ErrorActionPreference='Stop' }
  Assert-Test ($LASTEXITCODE -ne 0 -and (Get-FileHash -LiteralPath $env).Hash -ceq $configuredHash) 'Invalid public key was accepted.'
  Remove-Item -LiteralPath $fixturePublic -Confirm:$false
  $beforeRestore=Snapshot $root
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Action Restore -BackupDirectory $backup -PreviousApplicationVerified -WhatIf
  Assert-Test ($LASTEXITCODE -eq 0 -and (Snapshot $root) -ceq $beforeRestore) 'Restore WhatIf changed files.'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '$script' -Action Restore -BackupDirectory '$backup' -PreviousApplicationVerified -Confirm:`$false"
  Assert-Test ($LASTEXITCODE -eq 0 -and (Get-FileHash -LiteralPath $env).Hash -ceq $originalHash -and (Get-Acl -LiteralPath $env).Sddl -ceq $originalAcl) 'Restore did not recover original bytes/ACL.'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '$script' -Action Restore -BackupDirectory '$backup' -PreviousApplicationVerified -Confirm:`$false"
  Assert-Test ($LASTEXITCODE -eq 0) 'Restore not idempotent.'
  Write-Output 'PASS: PowerShell 5.1 parsing, WhatIf read-only, protected backup, credential preservation, atomic replacement, ACL preservation, conflict/wrong-runtime/unsafe-backup/invalid-key rejection, restoration without key and idempotence; disposable fixtures only.'
  Write-Output ('PASS: public key fixture format='+$KeyFormat+'; terminal NUL='+$TerminalNul.IsPresent)
} finally {
  $resolved=[IO.Path]::GetFullPath($root)
  $prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
  if (-not $resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notmatch '^GestorOS-RsaProcedureTests-[a-f0-9]{32}$') { throw 'Unsafe cleanup path.' }
  if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force -Confirm:$false }
}
