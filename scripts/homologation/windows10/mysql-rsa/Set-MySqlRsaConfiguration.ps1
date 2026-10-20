[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param(
  [ValidateSet('Check','Configure','Restore')][string]$Action='Check',
  [string]$BackupDirectory,
  [switch]$PreviousApplicationVerified
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$configRoot='C:\ProgramData\GestorOS\homologation\config'
$envFile=Join-Path $configRoot '.env.homologation'
$node='C:\Program Files\nodejs\node.exe'
$check=Join-Path $PSScriptRoot 'Check-MySqlRsa.mjs'
$expectedKey='C:\ProgramData\GestorOS\homologation\config\mysql\caching-sha2-public.pem'
$expectedHash='9C2384DBD2B09A2CCE97D276A7ECAB92B565B9FA15978162C82EFAFB90A8C73B'
$source=$null
$trustedSids=@('S-1-5-18','S-1-5-32-544')
function Get-ReadOnlyHash([string]$LiteralPath,[string]$Algorithm='SHA256') {
  if ($Algorithm -cne 'SHA256') { throw 'HASH_ALGORITHM_REJECTED' }
  $stream=[IO.File]::OpenRead($LiteralPath)
  $sha=[Security.Cryptography.SHA256]::Create()
  try { return [pscustomobject]@{ Hash=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','') } }
  finally { $sha.Dispose(); $stream.Dispose() }
}
function Assert-NoReparse([string]$Path) {
  $cursor=[IO.Path]::GetFullPath($Path)
  while ($cursor) {
    if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'REPARSE_POINT' }
    $parent=Split-Path -Parent $cursor
    if ($parent -eq $cursor) { break }; $cursor=$parent
  }
}
function Assert-TrustedWriters([string]$Path) {
  $acl=Get-Acl -LiteralPath $Path
  $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  if ($owner -notin $trustedSids) { throw 'OWNER_REVIEW_REQUIRED' }
  foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
    if ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) { continue }
    if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { continue }
    $writeMask=[Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
    if (($rule.FileSystemRights -band $writeMask) -and $rule.IdentityReference.Value -notin $trustedSids) { throw 'ACL_REVIEW_REQUIRED' }
  }
  return $acl
}
function Assert-Administrator {
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  $principal=New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'ELEVATED_ADMIN_REQUIRED' }
}
function Assert-PrivateBackup([string]$Path) {
  $acl=Assert-TrustedWriters $Path
  foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
    if ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) { continue }
    if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
        ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::ReadData) -and
        $rule.IdentityReference.Value -notin $trustedSids) { throw 'BACKUP_READ_ACCESS_REJECTED' }
  }
}
function Invoke-ConfigCheck([string]$Mode,[string]$Path) {
  $result=Invoke-NodeCaptured ('"'+$check+'" '+$Mode+' "'+$Path+'"')
  if ($result.Code -ne 0) { throw 'CONFIGURATION_OR_PUBLIC_KEY_CHECK_FAILED' }
  if ($result.HasError -or $result.Output.Trim() -cne 'CONFIGURATION_AND_PUBLIC_KEY_OK') { throw 'UNEXPECTED_CHECK_RESULT' }
}
function Invoke-NodeCaptured([string]$Arguments) {
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$node; $info.Arguments=$Arguments; $info.UseShellExecute=$false; $info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
  $info.EnvironmentVariables['NODE_DISABLE_COMPILE_CACHE']='1'
  $process=New-Object Diagnostics.Process; $process.StartInfo=$info
  try {
    if (-not $process.Start()) { throw 'NATIVE_START_FAILED' }
    $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(20000)) { $process.Kill(); throw 'NATIVE_TIMEOUT' }
    return [pscustomobject]@{ Code=$process.ExitCode; Output=$stdout.Result; HasError=($stderr.Result.Length -gt 0) }
  } finally { $process.Dispose() }
}
function Get-ReleaseCommit {
  $release=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Release-Context.json')) | ConvertFrom-Json
  if ($release.status -cne 'ready' -or $release.clean -ne $true -or $release.sourceCommit -cnotmatch '^[a-f0-9]{40}$') { throw 'RELEASE_NOT_READY' }
  return $release.sourceCommit
}
function New-ProtectedBackup([string]$Path) {
  if (Test-Path -LiteralPath $Path) { throw 'BACKUP_ALREADY_EXISTS' }
  $acl=New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true,$false)
  foreach ($sid in $trustedSids) {
    $identity=New-Object Security.Principal.SecurityIdentifier($sid)
    $rule=New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $acl.AddAccessRule($rule)
  }
  $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
  # Create with protected DACL from the start; never create an unprotected credential copy.
  $directory=New-Object IO.DirectoryInfo($Path)
  $directory.Create($acl)
  Assert-NoReparse $Path
  [void](Assert-TrustedWriters $Path)
}
try {
  foreach ($name in @('NODE_OPTIONS','DEBUG','NODE_DEBUG','NODE_COMPILE_CACHE','NODE_V8_COVERAGE')) {
    if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name,'Process'))) { throw 'INHERITED_DEBUG_OR_NODE_OPTIONS_REJECTED' }
  }
  if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or -not (Test-Path -LiteralPath $check -PathType Leaf)) { throw 'TOOLS_MISSING' }
  $version=Invoke-NodeCaptured '--version'
  if ($version.Code -ne 0 -or $version.HasError -or $version.Output.Trim() -notmatch '^v24\.') { throw 'NODE24_REQUIRED' }
  foreach ($path in @($configRoot,$envFile)) { Assert-NoReparse $path; [void](Assert-TrustedWriters $path) }
  $originalAcl=Get-Acl -LiteralPath $envFile
  $aclSections=[Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group
  $originalSddl=$originalAcl.GetSecurityDescriptorSddlForm($aclSections)
  $beforeHash=(Get-ReadOnlyHash -LiteralPath $envFile -Algorithm SHA256).Hash
  if ($Action -eq 'Restore') {
    $source=Get-ReleaseCommit
    if (-not $BackupDirectory -or -not $PreviousApplicationVerified) { throw 'RESTORE_REQUIRES_BACKUP_AND_VERIFIED_PREVIOUS_APPLICATION' }
    $backup=[IO.Path]::GetFullPath($BackupDirectory)
    if ([IO.Path]::GetDirectoryName($backup) -ine $configRoot -or [IO.Path]::GetFileName($backup) -notmatch '^mysql-rsa-backup-\d{8}T\d{6}Z-[a-f0-9]{32}$') { throw 'BACKUP_PATH_REJECTED' }
    foreach ($path in @($backup,(Join-Path $backup 'original.env'),(Join-Path $backup 'state.json'))) { Assert-NoReparse $path; Assert-PrivateBackup $path }
    $state=[IO.File]::ReadAllText((Join-Path $backup 'state.json')) | ConvertFrom-Json
    if ($state.sourceCommit -cne $source -or $state.envPath -ine $envFile -or $state.originalSha256 -notmatch '^[A-F0-9]{64}$' -or $state.configuredSha256 -notmatch '^[A-F0-9]{64}$') { throw 'BACKUP_STATE_INVALID' }
    if ((Get-ReadOnlyHash -LiteralPath (Join-Path $backup 'original.env') -Algorithm SHA256).Hash -cne $state.originalSha256) { throw 'BACKUP_HASH_MISMATCH' }
    if ($beforeHash -ceq $state.originalSha256) { Write-Output 'Configuracao anterior ja presente; nenhuma alteracao.'; return }
    if ($beforeHash -cne $state.configuredSha256) { throw 'CONFIG_CHANGED_SINCE_UPDATE_MANUAL_REVIEW_REQUIRED' }
    if ($originalSddl -cne $state.originalSddl) { throw 'CONFIG_ACL_CHANGED_MANUAL_REVIEW_REQUIRED' }
    $currentRuntime='C:\ProgramData\GestorOS\homologation\backend\runtime-info.json'
    Assert-NoReparse $currentRuntime
    if ((Get-ReadOnlyHash -LiteralPath $currentRuntime -Algorithm SHA256).Hash -cne $state.previousRuntimeSha256) { throw 'PREVIOUS_RUNTIME_NOT_RESTORED' }
    if ($WhatIfPreference) { Write-Output 'WhatIf: restauracao validada, nenhuma escrita ou servico alterado.'; return }
    Assert-Administrator
    if (-not $PSCmdlet.ShouldProcess($envFile,'Restaurar somente a configuracao anterior; aplicacao anterior ja verificada')) { return }
    $replacement=Join-Path $backup ('restore-'+[guid]::NewGuid().ToString('N')+'.tmp')
    [IO.File]::Copy((Join-Path $backup 'original.env'),$replacement,$false)
    if ((Get-ReadOnlyHash -LiteralPath $envFile -Algorithm SHA256).Hash -cne $beforeHash) { throw 'CONCURRENT_CONFIG_CHANGE' }
    [IO.File]::Replace($replacement,$envFile,[System.Management.Automation.Language.NullString]::Value)
    if ((Get-ReadOnlyHash -LiteralPath $envFile -Algorithm SHA256).Hash -cne $state.originalSha256 -or (Get-Acl -LiteralPath $envFile).GetSecurityDescriptorSddlForm($aclSections) -cne $state.originalSddl) { throw 'RESTORE_VERIFICATION_FAILED' }
    Write-Output 'Configuracao anterior restaurada e conferida. Backup e journals preservados. Validar servicos separadamente.'
    return
  }
  foreach ($path in @($expectedKey,(Split-Path -Parent $expectedKey))) { Assert-NoReparse $path; [void](Assert-TrustedWriters $path) }
  if ((Get-ReadOnlyHash -LiteralPath $expectedKey -Algorithm SHA256).Hash -cne $expectedHash) { throw 'PUBLIC_KEY_HASH_MISMATCH' }
  Invoke-ConfigCheck 'check-current' $envFile
  if ($Action -eq 'Check') { Write-Output 'Destino, chave publica e ausencia de conflitos validados. Nenhuma escrita.'; return }
  $bytes=[IO.File]::ReadAllBytes($envFile)
  $hasBom=$bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191
  $utf8=New-Object Text.UTF8Encoding($hasBom,$true)
  $text=$utf8.GetString($bytes).TrimStart([char]0xFEFF)
  $newline=if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $lines=New-Object 'System.Collections.Generic.List[string]'
  foreach ($line in ($text -split '\r\n|\n|\r')) {
    if ($line -match '^\s*(?:export\s+)?GOS_MYSQL_(?:AUTH_MODE|RSA_PUBLIC_KEY_FILE|RSA_PUBLIC_KEY_SHA256)\s*=') { continue }
    $lines.Add($line)
  }
  while ($lines.Count -gt 0 -and $lines[$lines.Count-1] -eq '') { $lines.RemoveAt($lines.Count-1) }
  $lines.Add('GOS_MYSQL_AUTH_MODE=rsa-pinned')
  $lines.Add('GOS_MYSQL_RSA_PUBLIC_KEY_FILE=C:/ProgramData/GestorOS/homologation/config/mysql/caching-sha2-public.pem')
  $lines.Add('GOS_MYSQL_RSA_PUBLIC_KEY_SHA256='+$expectedHash)
  $updated=($lines -join $newline)+$newline
  if ($text -ceq $updated) { Write-Output 'Configuracao RSA ja presente; nenhuma alteracao.'; return }
  if ($WhatIfPreference) { Write-Output 'WhatIf: configuracao RSA validada; nenhum backup, arquivo, ACL ou servico alterado.'; return }
  $source=Get-ReleaseCommit
  Assert-Administrator
  $runtime='C:\ProgramData\GestorOS\homologation\backend\runtime-info.json'
  Assert-NoReparse $runtime
  $runtimeHash=(Get-ReadOnlyHash -LiteralPath $runtime -Algorithm SHA256).Hash
  if (-not $PSCmdlet.ShouldProcess($envFile,'Criar backup protegido e configurar exclusivamente as tres variaveis RSA')) { return }
  $backup=Join-Path $configRoot ('mysql-rsa-backup-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')+'-'+[guid]::NewGuid().ToString('N'))
  New-ProtectedBackup $backup
  $original=Join-Path $backup 'original.env'
  [IO.File]::WriteAllBytes($original,$bytes)
  if ((Get-ReadOnlyHash -LiteralPath $original -Algorithm SHA256).Hash -cne $beforeHash) { throw 'BACKUP_VERIFICATION_FAILED' }
  $candidate=Join-Path $backup 'candidate.env'
  [IO.File]::WriteAllText($candidate,$updated,$utf8)
  Invoke-ConfigCheck 'check-ready' $candidate
  $afterHash=(Get-ReadOnlyHash -LiteralPath $candidate -Algorithm SHA256).Hash
  $state=[ordered]@{ sourceCommit=$source; envPath=$envFile; originalSha256=$beforeHash; configuredSha256=$afterHash; originalSddl=$originalSddl; previousRuntimeSha256=$runtimeHash; createdAtUtc=[DateTime]::UtcNow.ToString('o') }
  [IO.File]::WriteAllText((Join-Path $backup 'state.json'),($state | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
  if ((Get-ReadOnlyHash -LiteralPath $envFile -Algorithm SHA256).Hash -cne $beforeHash) { throw 'CONCURRENT_CONFIG_CHANGE' }
  [IO.File]::Replace($candidate,$envFile,[System.Management.Automation.Language.NullString]::Value)
  if ((Get-ReadOnlyHash -LiteralPath $envFile -Algorithm SHA256).Hash -cne $afterHash -or (Get-Acl -LiteralPath $envFile).GetSecurityDescriptorSddlForm($aclSections) -cne $originalSddl) { throw 'CONFIGURATION_OR_ACL_VERIFICATION_FAILED' }
  Write-Output ('Configuracao RSA atualizada. Backup protegido: '+$backup)
  Write-Output 'Nenhum servico reiniciado. Nao apagar o backup; ele contem a configuracao anterior sensivel.'
} catch {
  Write-Error 'Operacao interrompida. Nao exibir excecoes brutas nem o conteudo dos arquivos; preservar backup e solicitar revisao administrativa.' -ErrorAction Continue
  exit 1
}
