[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot 'Set-MySqlRsaConfiguration.ps1'
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if (@($errors).Count -ne 0) { throw 'Invalid PowerShell 5.1 syntax.' }
foreach ($name in @('Assert-TrustedWriters','Assert-PrivateBackup','Invoke-NodeCaptured','Invoke-ConfigCheck')) {
 $fn=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
 if ($null -eq $fn) { throw 'Missing function.' }
 Invoke-Expression $fn.Extent.Text
}
function Assert-Test([bool]$Value,[string]$Message) { if (-not $Value) { throw $Message } }
function Assert-Refused([scriptblock]$Call,[string]$Code) {
 try { & $Call; throw 'EXPECTED_REFUSAL_MISSING' } catch { if ($_.Exception.Message -cne $Code) { throw 'Wrong refusal or native secret leaked.' } }
}
$trustedSids=@('S-1-5-18','S-1-5-32-544')
$script:fakeAcl=New-Object Security.AccessControl.DirectorySecurity
$script:fakeAcl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
function Get-Acl { param([string]$LiteralPath); return $script:fakeAcl }
$everyone=New-Object Security.Principal.SecurityIdentifier('S-1-1-0')
$inheritOnly=New-Object Security.AccessControl.FileSystemAccessRule($everyone,'Read,Write','ContainerInherit,ObjectInherit','InheritOnly','Allow')
$script:fakeAcl.AddAccessRule($inheritOnly)
[void](Assert-TrustedWriters 'metadata-only')
Assert-PrivateBackup 'metadata-only'
Write-Output 'PASS: InheritOnly does not apply to current object, including backup reader policy.'
$effective=New-Object Security.AccessControl.FileSystemAccessRule($everyone,'Write','Allow')
$script:fakeAcl.AddAccessRule($effective)
Assert-Refused { [void](Assert-TrustedWriters 'child-effective') } 'ACL_REVIEW_REQUIRED'
Write-Output 'PASS: same write permission effective on child is rejected.'
$script:fakeAcl.RemoveAccessRuleSpecific($effective)
$read=New-Object Security.AccessControl.FileSystemAccessRule($everyone,'Read','Allow')
$script:fakeAcl.AddAccessRule($read)
Assert-Refused { Assert-PrivateBackup 'backup-effective' } 'BACKUP_READ_ACCESS_REJECTED'
Write-Output 'PASS: effective public read on backup is still rejected.'
$root=Join-Path ([IO.Path]::GetTempPath()) ('GestorOS-RsaNativeTests-'+[guid]::NewGuid().ToString('N'))
$node=(Get-Command node.exe).Source
$check=Join-Path $root 'fixture.mjs'
$utf8=New-Object Text.UTF8Encoding($false)
try {
 [void][IO.Directory]::CreateDirectory($root)
 [IO.File]::WriteAllText($check,'console.error("synthetic-secret-marker");process.exitCode=7;',$utf8)
 $r=Invoke-NodeCaptured ('"'+$check+'"')
 Assert-Test ($r.Code -eq 7 -and $r.HasError) 'Lost native exit code/stderr in PowerShell 5.1.'
 Assert-Refused { Invoke-ConfigCheck 'check-current' 'synthetic' } 'CONFIGURATION_OR_PUBLIC_KEY_CHECK_FAILED'
 Write-Output 'PASS: real stderr under ErrorActionPreference Stop is captured without NativeCommandError or secret publication.'
 [IO.File]::WriteAllText($check,'console.log("CONFIGURATION_AND_PUBLIC_KEY_OK");console.error("synthetic-secret-marker");',$utf8)
 Assert-Refused { Invoke-ConfigCheck 'check-current' 'synthetic' } 'UNEXPECTED_CHECK_RESULT'
 [IO.File]::WriteAllText($check,'console.log("CONFIGURATION_AND_PUBLIC_KEY_OK");process.exitCode=2;',$utf8)
 Assert-Refused { Invoke-ConfigCheck 'check-current' 'synthetic' } 'CONFIGURATION_OR_PUBLIC_KEY_CHECK_FAILED'
 [IO.File]::WriteAllText($check,'console.log("CONFIGURATION_AND_PUBLIC_KEY_OK");',$utf8)
 Invoke-ConfigCheck 'check-current' 'synthetic'
 Write-Output 'PASS: only zero exit + exact success + empty stderr succeeds.'
} finally {
 $absolute=[IO.Path]::GetFullPath($root); $prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
 if (-not $absolute.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($absolute) -notmatch '^GestorOS-RsaNativeTests-[a-f0-9]{32}$') { throw 'Unsafe cleanup.' }
 if (Test-Path -LiteralPath $absolute) { Remove-Item -LiteralPath $absolute -Recurse -Force -Confirm:$false }
}
