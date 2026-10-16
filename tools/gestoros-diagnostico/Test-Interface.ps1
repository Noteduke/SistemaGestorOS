# Optional Windows Forms smoke test. Opens the application and closes it automatically.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$timer=New-Object Windows.Forms.Timer
$timer.Interval=1500
$timer.add_Tick({
  $timer.Stop()
  foreach ($window in @([Windows.Forms.Application]::OpenForms)) { $window.Close() }
})
try {
  $timer.Start()
  . (Join-Path $PSScriptRoot 'GestorOS-Diagnostico.ps1')
  if (-not $script:report -or $script:report.Resultados.Count -lt 20) { throw 'UI did not collect results.' }
  Write-Output "Windows Forms: opened, collected $($script:report.Resultados.Count) results and closed successfully."
} finally { $timer.Stop(); $timer.Dispose() }
