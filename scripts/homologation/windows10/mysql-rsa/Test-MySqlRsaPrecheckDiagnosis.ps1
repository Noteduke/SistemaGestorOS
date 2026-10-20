[CmdletBinding()]
param([ValidateSet('spki','pkcs1')][string]$KeyFormat='spki')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('GestorOS-RsaDiagnosisTests-'+[guid]::NewGuid().ToString('N'))
$utf8=New-Object Text.UTF8Encoding($false)
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
function Assert-Test([bool]$Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
function Snapshot {
  return (@(Get-ChildItem -LiteralPath $root -Force -File -Recurse | Sort-Object FullName | ForEach-Object { $_.FullName+'|'+(Get-FileHash -LiteralPath $_.FullName).Hash+'|'+(Get-Acl -LiteralPath $_.FullName).Sddl }) -join "`n")
}
function Run-Case([string]$Name,[string]$Expected,[hashtable]$Environment=@{}) {
  $before=Snapshot
  $start=New-Object Diagnostics.ProcessStartInfo
  $start.FileName='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
  $start.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $root 'Diagnose-MySqlRsaPrecheck.ps1')+'"'
  $start.UseShellExecute=$false; $start.CreateNoWindow=$true; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
  foreach ($key in @('DATABASE_URL','GOS_ENV_FILE','GOS_DEPLOYMENT_ENV','GOS_DATABASE_TARGET','GOS_EXTERNAL_EFFECTS_ENABLED','NODE_OPTIONS','DEBUG','NODE_DEBUG','GOS_MYSQL_AUTH_MODE','GOS_MYSQL_RSA_PUBLIC_KEY_FILE','GOS_MYSQL_RSA_PUBLIC_KEY_SHA256')) { $start.EnvironmentVariables.Remove($key) }
  foreach ($key in $Environment.Keys) { $start.EnvironmentVariables[$key]=$Environment[$key] }
  $process=[Diagnostics.Process]::Start($start)
  try { $stdout=$process.StandardOutput.ReadToEnd(); $stderr=$process.StandardError.ReadToEnd(); $process.WaitForExit(); $code=$process.ExitCode }
  finally { $process.Dispose() }
  Assert-Test ($stdout.Contains($Expected)) ('Missing expected safe stage: '+$Name+'; output='+$stdout)
  Assert-Test (($code -eq 0) -eq ($Name -eq 'success')) ('Wrong exit code: '+$Name)
  Assert-Test (-not ($stdout+$stderr).Contains('synthetic-secret-marker')) ('Secret leaked: '+$Name)
  Assert-Test ((Snapshot) -ceq $before) ('Diagnostic modified fixture: '+$Name)
  Write-Output ('PASS: PS5.1 read-only diagnosis '+$Name)
}
function Confirm-OriginalGenericFailure([string]$Name) {
  $before=Snapshot
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
  $info.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $root 'Set-MySqlRsaConfiguration.ps1')+'" -Action Check'
  $info.UseShellExecute=$false; $info.CreateNoWindow=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
  foreach ($key in @('DATABASE_URL','GOS_ENV_FILE','GOS_DEPLOYMENT_ENV','GOS_DATABASE_TARGET','GOS_EXTERNAL_EFFECTS_ENABLED','NODE_OPTIONS','DEBUG','NODE_DEBUG')) { $info.EnvironmentVariables.Remove($key) }
  $process=[Diagnostics.Process]::Start($info)
  try { $stdout=$process.StandardOutput.ReadToEnd(); $stderr=$process.StandardError.ReadToEnd(); $process.WaitForExit(); $code=$process.ExitCode }
  finally { $process.Dispose() }
  Assert-Test ($code -ne 0 -and ($stdout+$stderr).Contains('Operacao interrompida.')) ('Original generic failure not reproduced: '+$Name)
  Assert-Test (-not ($stdout+$stderr).Contains('synthetic-secret-marker') -and (Snapshot) -ceq $before) ('Original Check leaked or wrote fixture: '+$Name)
  Write-Output ('PASS: original -Action Check generic failure reproduced '+$Name)
}
try {
  [void][IO.Directory]::CreateDirectory($root)
  $acl=Get-Acl -LiteralPath $root; $acl.SetAccessRuleProtection($true,$false)
  foreach ($identity in @($sid,'S-1-5-18','S-1-5-32-544')) { $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($identity)),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))) }
  Set-Acl -LiteralPath $root -AclObject $acl -Confirm:$false
  $config=Join-Path $root 'config'; [void][IO.Directory]::CreateDirectory((Join-Path $config 'mysql'))
  $env=Join-Path $config '.env.homologation'; $key=Join-Path $config 'mysql/caching-sha2-public.pem'
  $node=(Get-Command node.exe).Source
  $generator=Join-Path $root 'fixture-key.mjs'
  [IO.File]::WriteAllText($generator,'import fs from "node:fs";import {generateKeyPairSync} from "node:crypto";fs.writeFileSync(process.argv[2],generateKeyPairSync("rsa",{modulusLength:2048}).publicKey.export({type:process.argv[3],format:"pem"}));',$utf8)
  & $node $generator $key $KeyFormat
  if ($LASTEXITCODE -ne 0) { throw 'Fixture generation failed.' }
  $keyBytes=[IO.File]::ReadAllBytes($key); $keyHash=(Get-FileHash -LiteralPath $key).Hash
  $original=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Set-MySqlRsaConfiguration.ps1'))
  $helper=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Check-MySqlRsa.mjs'))
  $diagnosis=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Diagnose-MySqlRsaPrecheck.ps1'))
  foreach ($variable in @('original','helper','diagnosis')) {
    $value=Get-Variable -Name $variable -ValueOnly
    $value=$value.Replace('C:\ProgramData\GestorOS\homologation',$root).Replace('C:/ProgramData/GestorOS/homologation',$root.Replace('\','/')).Replace('C:\Program Files\nodejs\node.exe',$node)
    $value=$value.Replace("@('S-1-5-18','S-1-5-32-544')",("@('S-1-5-18','S-1-5-32-544','"+$sid+"')"))
    $value=$value.Replace('9C2384DBD2B09A2CCE97D276A7ECAB92B565B9FA15978162C82EFAFB90A8C73B',$keyHash)
    Set-Variable -Name $variable -Value $value
  }
  $sourcePath=Join-Path $root 'Set-MySqlRsaConfiguration.ps1'; $helperPath=Join-Path $root 'Check-MySqlRsa.mjs'; $diagPath=Join-Path $root 'Diagnose-MySqlRsaPrecheck.ps1'
  [IO.File]::WriteAllText($sourcePath,$original,$utf8); [IO.File]::WriteAllText($helperPath,$helper,$utf8)
  $diagnosis=$diagnosis.Replace('2BF13853DAE4F4C843337FF73F625599B974FD4314E08CF2633852E9DC31B4C8',(Get-FileHash -LiteralPath $sourcePath).Hash).Replace('E0BF62768CD61587C9BF27639F9F3080535A81A901E4B1BF42696C254ADD2912',(Get-FileHash -LiteralPath $helperPath).Hash)
  [IO.File]::WriteAllText($diagPath,$diagnosis,$utf8)
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Diagnose-MySqlRsaPrecheck.mjs') -Destination (Join-Path $root 'Diagnose-MySqlRsaPrecheck.mjs')
  $envText="DATABASE_URL=mysql://gos_homologation_app:synthetic-secret-marker@127.0.0.1:3306/gestor_os_homologation`r`nGOS_DEPLOYMENT_ENV=homologation`r`nGOS_DATABASE_TARGET=gestor_os_homologation`r`nGOS_EXTERNAL_EFFECTS_ENABLED=false`r`n"
  [IO.File]::WriteAllText($env,$envText,$utf8)
  Run-Case 'success' 'PASS stage=PRECHECK_DIAGNOSIS_COMPLETE'
  Run-Case 'debug-inherited' 'FAIL stage=INHERITED_DEBUG_OPTIONS code=INHERITED_DEBUG_OR_NODE_OPTIONS_REJECTED' @{DEBUG='synthetic-secret-marker'}
  Run-Case 'env-inherited' 'FAIL stage=JS_INHERITED_ENV code=INHERITED_ENV_CONFLICT' @{GOS_DATABASE_TARGET='wrong-synthetic'}
  [IO.File]::WriteAllText($diagPath,$diagnosis.Replace(("@('S-1-5-18','S-1-5-32-544','"+$sid+"')"),"@('S-1-5-18','S-1-5-32-544')"),$utf8)
  Run-Case 'owner-policy' 'FAIL stage=CONFIG_DIRECTORY_POLICY code=OWNER_REVIEW_REQUIRED'
  [IO.File]::WriteAllText($diagPath,$diagnosis,$utf8)
  $envAcl=Get-Acl -LiteralPath $env; $unsafe=Get-Acl -LiteralPath $env
  $unsafe.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-19')),'Write','Allow')))
  Set-Acl -LiteralPath $env -AclObject $unsafe -Confirm:$false
  Run-Case 'localservice-write-policy' 'DETAIL stage=ENV_FILE_POLICY policy=ALLOW_WRITE_LOCAL_SERVICE_OUTSIDE_POLICY'
  Confirm-OriginalGenericFailure 'ACL-policy'
  Set-Acl -LiteralPath $env -AclObject $envAcl -Confirm:$false
  [IO.File]::WriteAllText($env,$envText.Replace('/gestor_os_homologation','/gestor_os'),$utf8)
  Run-Case 'wrong-target' 'FAIL stage=JS_CONFIG_VALIDATION code=WRONG_TARGET'
  Confirm-OriginalGenericFailure 'Node-config-failure'
  [IO.File]::WriteAllText($env,$envText+"GOS_MYSQL_TLS_CA_FILE=synthetic`r`n",$utf8)
  Run-Case 'conflicting-auth' 'FAIL stage=JS_CONFIG_VALIDATION code=CONFLICTING_AUTH_CONFIG'
  [IO.File]::WriteAllText($env,$envText+"GOS_DATABASE_TARGET=duplicate`r`n",$utf8)
  Run-Case 'duplicate-config' 'FAIL stage=JS_CONFIG_VALIDATION code=DUPLICATE_KEY'
  [IO.File]::WriteAllText($env,$envText,$utf8)
  [IO.File]::WriteAllText($key,'wrong-synthetic-public',$utf8)
  Run-Case 'key-hash' 'FAIL stage=PUBLIC_KEY_SHA256 code=PUBLIC_KEY_HASH_MISMATCH'
  [IO.File]::WriteAllBytes($key,$keyBytes)
  Remove-Item -LiteralPath $env -Confirm:$false
  Run-Case 'missing-env' 'FAIL stage=ENV_FILE_REPARSE code=PATH_NOT_FOUND'
  Write-Output 'PASS: 10 simulated cases, no database, no mutations by diagnosis, no secret output.'
} finally {
  $absolute=[IO.Path]::GetFullPath($root); $prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
  if (-not $absolute.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($absolute) -notmatch '^GestorOS-RsaDiagnosisTests-[a-f0-9]{32}$') { throw 'Unsafe fixture cleanup.' }
  if (Test-Path -LiteralPath $absolute) { Remove-Item -LiteralPath $absolute -Recurse -Force -Confirm:$false }
}
