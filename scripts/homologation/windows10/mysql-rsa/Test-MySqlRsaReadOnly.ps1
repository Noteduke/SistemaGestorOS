[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
foreach ($name in @('NODE_OPTIONS','NODE_PATH','NODE_V8_COVERAGE','DEBUG','NODE_DEBUG')) {
  if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name,'Process'))) { throw 'Use um terminal sem instrumentacao Node ou debug herdado; nao exibir valores.' }
}
$node='C:\Program Files\nodejs\node.exe'
$diagnostic=Join-Path $PSScriptRoot 'Check-MySqlRsa.mjs'
if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or -not (Test-Path -LiteralPath $diagnostic -PathType Leaf)) { throw 'Node ou diagnostico ausente.' }
$version=@(& $node --version)
if ($LASTEXITCODE -ne 0 -or ($version -join '') -notmatch '^v24\.') { throw 'Node.js 24 obrigatorio.' }
# ProcessStartInfo avoids PowerShell 5.1 native-stderr exceptions replacing safe evidence.
. (Join-Path $PSScriptRoot 'MysqlDiagnosticOutput.ps1')
$info=New-Object Diagnostics.ProcessStartInfo
$info.FileName=$node; $info.Arguments='"'+$diagnostic+'" diagnose'
$info.UseShellExecute=$false; $info.CreateNoWindow=$true
$info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
$info.EnvironmentVariables['NODE_DISABLE_COMPILE_CACHE']='1'
$process=New-Object Diagnostics.Process; $process.StartInfo=$info
try {
 [void]$process.Start()
 $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync()
 if (-not $process.WaitForExit(45000)) { $process.Kill(); throw 'DIAGNOSTIC_TIMEOUT' }
 $text=$stdout.Result; $errorText=$stderr.Result; $code=$process.ExitCode
} finally { $process.Dispose() }
Write-Output (ConvertTo-SafeMysqlDiagnosticOutput $text $errorText $code)
if ($code -ne 0) { exit 1 }