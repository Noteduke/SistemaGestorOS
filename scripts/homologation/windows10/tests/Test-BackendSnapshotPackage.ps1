[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$PackagePath,
  [Parameter(Mandatory=$true)][string]$ExpectedSha256,
  [Parameter(Mandatory=$true)][string]$ReleaseIdentity
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$updater=Join-Path (Split-Path -Parent $PSScriptRoot) 'Update-HomologationRelease.ps1'
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($updater,[ref]$tokens,[ref]$errors)
if (@($errors).Count) { throw 'PARSER_FAILED' }
foreach($fn in $ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)) {
  Invoke-Expression $fn.Extent.Text
}
$info=Get-ValidatedPackageInfo -Path $PackagePath -ExpectedSha256 $ExpectedSha256 -ExpectedCommit $ReleaseIdentity
$qualified='Microsoft.PowerShell.Core\FileSystem::'+[IO.Path]::GetFullPath($PackagePath)
$qualifiedInfo=Get-ValidatedPackageInfo -Path $qualified -ExpectedSha256 $ExpectedSha256 -ExpectedCommit $ReleaseIdentity
if ($qualifiedInfo.Sha256 -cne $info.Sha256) {throw 'PROVIDER_PATH_FAILED'}
if (-not $info.BackendOnly -or -not $info.CompleteRuntime -or $info.SourceCommit -cne $ReleaseIdentity) {throw 'PROFILE_FAILED'}
if (@($info.Entries | Where-Object {$_ -like 'frontend/*' -or $_ -match '(^|/)(\.env[^/]*|Usuarios e senhas.txt)$'}).Count) {throw 'UNEXPECTED_FILES'}
foreach($bad in @('snapshot:'+('0'*64),('1'*40))) {
  $rejected=$false
  try {Get-ValidatedPackageInfo -Path $PackagePath -ExpectedSha256 $ExpectedSha256 -ExpectedCommit $bad | Out-Null} catch {$rejected=$true}
  if (-not $rejected) {throw 'BAD_IDENTITY_ACCEPTED'}
}
$rejected=$false
try {Get-ValidatedPackageInfo -Path $PackagePath -ExpectedSha256 ('0'*64) -ExpectedCommit $ReleaseIdentity | Out-Null} catch {$rejected=$true}
if (-not $rejected) {throw 'BAD_HASH_ACCEPTED'}
$items=@(New-ReleaseArtifactItems -InstallRoot 'C:\fixture' -StageRoot 'C:\stage' -BackupRoot 'C:\backup' -CompleteRuntime $true -BackendOnly $true)
if ($items.Count -ne 1 -or $items[0].Name -cne 'backend') {throw 'ARTIFACT_SCOPE_FAILED'}
Write-Output ('PASS: real ZIP, exact hash coverage, snapshot identity, backend-only scope; files='+$info.Entries.Count)
Write-Output 'PASS: wrong snapshot, false Git commit and wrong ZIP hash rejected; no environment, service or database access.'
