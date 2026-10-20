[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('GestorOS-RsaReadOnlyTests-'+[guid]::NewGuid().ToString('N'))
$utf8=New-Object Text.UTF8Encoding($false)
try {
  [void][IO.Directory]::CreateDirectory($root)
  $node=(Get-Command node.exe).Source
  $wrapper=Join-Path $root 'Test-MySqlRsaReadOnly.ps1'
  $source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Test-MySqlRsaReadOnly.ps1')).Replace('C:\Program Files\nodejs\node.exe',$node)
  [IO.File]::WriteAllText($wrapper,$source,$utf8)
  $ok='READ_ONLY_OK database=gestor_os_homologation account=gos_homologation_app@127.0.0.1 prisma=7.10.1'
  $cases=@(
    @{Name='exact-account'; Output=$ok; Code=0; Success=$true},
    @{Name='localhost-rejected'; Output=$ok.Replace('@127.0.0.1','@localhost'); Code=0; Success=$false},
    @{Name='wildcard-rejected'; Output=$ok.Replace('@127.0.0.1','@%'); Code=0; Success=$false},
    @{Name='external-host-rejected'; Output=$ok.Replace('@127.0.0.1','@192.0.2.1'); Code=0; Success=$false},
    @{Name='wrong-user'; Output=$ok.Replace('gos_homologation_app@','root@'); Code=0; Success=$false},
    @{Name='wrong-database'; Output=$ok.Replace('database=gestor_os_homologation','database=gestor_os'); Code=0; Success=$false},
    @{Name='nonzero-with-success-text'; Output=$ok; Code=1; Success=$false},
    @{Name='auth-failure'; Output='CHECK_FAILED category=AUTHENTICATION'; Code=1; Success=$false},
    @{Name='pool-failure'; Output='CHECK_FAILED category=POOL'; Code=1; Success=$false},
    @{Name='raw-error-not-forwarded'; Output='synthetic-secret-marker'; Code=1; Success=$false}
  )
  foreach ($case in $cases) {
    # A fake Node companion prints fixture strings only. No adapter, helper, sockets or real config.
    $fake='console.log('+($case.Output | ConvertTo-Json -Compress)+');process.exitCode='+$case.Code+';'
    [IO.File]::WriteAllText((Join-Path $root 'Check-MySqlRsa.mjs'),$fake,$utf8)
    $start=New-Object Diagnostics.ProcessStartInfo
    $start.FileName=(Get-Command powershell.exe).Source
    $start.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$wrapper+'"'
    $start.UseShellExecute=$false; $start.CreateNoWindow=$true; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
    foreach ($name in @('NODE_OPTIONS','DEBUG','NODE_DEBUG')) { $start.EnvironmentVariables.Remove($name) }
    $process=[Diagnostics.Process]::Start($start)
    try { $stdout=$process.StandardOutput.ReadToEnd(); $stderr=$process.StandardError.ReadToEnd(); $process.WaitForExit(); $code=$process.ExitCode }
    finally { $process.Dispose() }
    if (($code -eq 0) -ne $case.Success) { throw ('Unexpected wrapper result: '+$case.Name) }
    if ($case.Success -and $stdout.Trim() -cne $ok) { throw 'Success output mismatch.' }
    if (($stdout+$stderr).Contains('synthetic-secret-marker')) { throw 'Native output leaked.' }
    Write-Output ('PASS: PowerShell 5.1 read-only wrapper '+$case.Name)
  }
} finally {
  $resolved=[IO.Path]::GetFullPath($root)
  $prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
  if (-not $resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notmatch '^GestorOS-RsaReadOnlyTests-[a-f0-9]{32}$') { throw 'Unsafe fixture cleanup.' }
  if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force -Confirm:$false }
}
