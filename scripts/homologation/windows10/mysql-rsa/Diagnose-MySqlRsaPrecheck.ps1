[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$configRoot='C:\ProgramData\GestorOS\homologation\config'
$envFile=Join-Path $configRoot '.env.homologation'
$keyFile=Join-Path $configRoot 'mysql\caching-sha2-public.pem'
$node='C:\Program Files\nodejs\node.exe'
$sourceFile=Join-Path $PSScriptRoot 'Set-MySqlRsaConfiguration.ps1'
$helperFile=Join-Path $PSScriptRoot 'Check-MySqlRsa.mjs'
$diagnosticFile=Join-Path $PSScriptRoot 'Diagnose-MySqlRsaPrecheck.mjs'
$expectedSourceHash='2BF13853DAE4F4C843337FF73F625599B974FD4314E08CF2633852E9DC31B4C8'
$expectedHelperHash='E0BF62768CD61587C9BF27639F9F3080535A81A901E4B1BF42696C254ADD2912'
$expectedKeyHash='9C2384DBD2B09A2CCE97D276A7ECAB92B565B9FA15978162C82EFAFB90A8C73B'
$trustedSids=@('S-1-5-18','S-1-5-32-544')
$stage='START'
function Get-SafeHash([string]$Path) {
  $stream=[IO.File]::OpenRead($Path); $sha=[Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','') }
  finally { $sha.Dispose(); $stream.Dispose() }
}
function Invoke-CapturedNode([string]$Arguments) {
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$node; $info.Arguments=$Arguments
  $info.UseShellExecute=$false; $info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
  $info.EnvironmentVariables['NODE_DISABLE_COMPILE_CACHE']='1'
  $process=New-Object Diagnostics.Process
  $process.StartInfo=$info
  try {
    if (-not $process.Start()) { throw 'NATIVE_START_FAILED' }
    $outTask=$process.StandardOutput.ReadToEndAsync(); $errTask=$process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(20000)) { $process.Kill(); throw 'NATIVE_TIMEOUT' }
    # Captured stderr is NEVER forwarded, even for parse/load failures.
    return [pscustomobject]@{Code=$process.ExitCode; Out=$outTask.Result; HasErrorText=($errTask.Result.Length -gt 0)}
  } finally { $process.Dispose() }
}
function Invoke-PolicyStages([string]$Alias,[string]$Path) {
  $script:stage=$Alias+'_REPARSE'
  Assert-NoReparse $Path
  Write-Output ('PASS stage='+$script:stage)
  $script:stage=$Alias+'_POLICY'
  try { [void](Assert-TrustedWriters $Path) }
  catch {
    # Metadata classification only; no names, SIDs, paths or ACL dump.
    if ($_.Exception.Message -eq 'OWNER_REVIEW_REQUIRED') {
      Write-Output ('DETAIL stage='+$script:stage+' policy=OWNER_NOT_SYSTEM_OR_ADMIN_GROUP')
    } elseif ($_.Exception.Message -eq 'ACL_REVIEW_REQUIRED') {
      $acl=Get-Acl -LiteralPath $Path
      $writeMask=[Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
      $hasLocalService=$false
      foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) { continue }
        if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and ($rule.FileSystemRights -band $writeMask) -and $rule.IdentityReference.Value -eq 'S-1-5-19') { $hasLocalService=$true }
      }
      $detail=if ($hasLocalService) { 'ALLOW_WRITE_LOCAL_SERVICE_OUTSIDE_POLICY' } else { 'ALLOW_WRITE_TRUSTEE_OUTSIDE_POLICY' }
      Write-Output ('DETAIL stage='+$script:stage+' policy='+$detail)
    }
    throw
  }
  Write-Output ('PASS stage='+$script:stage)
}
try {
  $stage='POWERSHELL_VERSION'
  if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) { throw 'POWERSHELL51_REQUIRED' }
  Write-Output ('PASS stage='+$stage)
  $stage='INHERITED_DEBUG_OPTIONS'
  foreach ($name in @('NODE_OPTIONS','DEBUG','NODE_DEBUG','NODE_COMPILE_CACHE','NODE_V8_COVERAGE')) {
    if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name,'Process'))) { throw 'INHERITED_DEBUG_OR_NODE_OPTIONS_REJECTED' }
  }
  Write-Output ('PASS stage='+$stage)
  $stage='TOOLS'
  foreach ($file in @($node,$sourceFile,$helperFile,$diagnosticFile)) {
    if (-not [IO.File]::Exists($file)) { throw 'TOOLS_MISSING' }
  }
  Write-Output ('PASS stage='+$stage)
  $stage='SOURCE_HASH'
  if ((Get-SafeHash $sourceFile) -cne $expectedSourceHash -or (Get-SafeHash $helperFile) -cne $expectedHelperHash) { throw 'REVIEWED_SOURCE_MISMATCH' }
  Write-Output ('PASS stage='+$stage)
  $stage='SOURCE_PARSE'
  $tokens=$null; $parseErrors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile($sourceFile,[ref]$tokens,[ref]$parseErrors)
  if (@($parseErrors).Count -gt 0) { throw 'SOURCE_PARSE_FAILED' }
  # Import ONLY the two reviewed, read-only functions. Never execute the original entrypoint.
  foreach ($name in @('Assert-NoReparse','Assert-TrustedWriters')) {
    $definitions=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst]},$false) | Where-Object Name -eq $name)
    if ($definitions.Count -ne 1) { throw 'SOURCE_FUNCTION_MISSING' }
    Invoke-Expression $definitions[0].Extent.Text
  }
  Write-Output ('PASS stage='+$stage)
  $stage='NODE_VERSION'
  $version=Invoke-CapturedNode '--version'
  if ($version.Code -ne 0 -or $version.HasErrorText -or $version.Out.Trim() -notmatch '^v24\.') { throw 'NODE24_REQUIRED' }
  Write-Output ('PASS stage='+$stage)
  Invoke-PolicyStages 'CONFIG_DIRECTORY' $configRoot
  Invoke-PolicyStages 'ENV_FILE' $envFile
  $stage='ENV_SECURITY_DESCRIPTOR'
  $sections=[Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group
  [void](Get-Acl -LiteralPath $envFile).GetSecurityDescriptorSddlForm($sections)
  Write-Output ('PASS stage='+$stage)
  $stage='ENV_READ_HASH'
  [void](Get-SafeHash $envFile)
  Write-Output ('PASS stage='+$stage)
  Invoke-PolicyStages 'PUBLIC_KEY_FILE' $keyFile
  Invoke-PolicyStages 'PUBLIC_KEY_DIRECTORY' (Split-Path -Parent $keyFile)
  $stage='PUBLIC_KEY_SHA256'
  if ((Get-SafeHash $keyFile) -cne $expectedKeyHash) { throw 'PUBLIC_KEY_HASH_MISMATCH' }
  Write-Output ('PASS stage='+$stage)
  $stage='NODE_OFFLINE_VALIDATION'
  $result=Invoke-CapturedNode ('"'+$diagnosticFile+'"')
  $safeLines=@()
  foreach ($line in ($result.Out -split '\r\n|\n|\r')) {
    if ($line -match '^(PASS stage=JS_[A-Z_]+|FAIL stage=JS_[A-Z_]+ code=[A-Z_]+)$') { $safeLines+=$line }
    elseif (-not [string]::IsNullOrWhiteSpace($line)) { throw 'UNEXPECTED_NATIVE_OUTPUT' }
  }
  foreach ($line in $safeLines) { Write-Output $line }
  if ($result.Code -ne 0) { throw 'NODE_OFFLINE_CHECK_FAILED' }
  if ($result.HasErrorText) { throw 'NATIVE_STDERR_PRESENT' }
  if ($safeLines.Count -eq 0 -or $safeLines[$safeLines.Count-1] -cne 'PASS stage=JS_OFFLINE_COMPLETE') { throw 'NATIVE_RESULT_INVALID' }
  Write-Output 'PASS stage=PRECHECK_DIAGNOSIS_COMPLETE'
} catch {
  $safe=@('POWERSHELL51_REQUIRED','INHERITED_DEBUG_OR_NODE_OPTIONS_REJECTED','TOOLS_MISSING','REVIEWED_SOURCE_MISMATCH',
    'SOURCE_PARSE_FAILED','SOURCE_FUNCTION_MISSING','NODE24_REQUIRED','REPARSE_POINT','OWNER_REVIEW_REQUIRED','ACL_REVIEW_REQUIRED',
    'PUBLIC_KEY_HASH_MISMATCH','NODE_OFFLINE_CHECK_FAILED','NATIVE_STDERR_PRESENT','UNEXPECTED_NATIVE_OUTPUT','NATIVE_RESULT_INVALID','NATIVE_START_FAILED','NATIVE_TIMEOUT')
  $code=if ($_.Exception.Message -in $safe) { $_.Exception.Message } else { 'READ_OR_METADATA_ACCESS_FAILED' }
  if ($code -eq 'READ_OR_METADATA_ACCESS_FAILED') {
    $base=$_.Exception.GetBaseException()
    if ($base -is [UnauthorizedAccessException]) { $code='READ_ACCESS_DENIED' }
    elseif ($base -is [IO.FileNotFoundException]) { $code='FILE_MISSING' }
    elseif ($base -is [IO.DirectoryNotFoundException]) { $code='DIRECTORY_MISSING' }
    elseif ($_.FullyQualifiedErrorId -like 'PathNotFound*') { $code='PATH_NOT_FOUND' }
    elseif ($_.FullyQualifiedErrorId -like 'PropertyNotFoundStrict*') { $code='STRICT_PROPERTY_UNAVAILABLE' }
  }
  Write-Output ('FAIL stage='+$stage+' code='+$code)
  exit 1
}
