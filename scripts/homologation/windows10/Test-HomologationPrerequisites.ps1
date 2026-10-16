[CmdletBinding()]
param([string]$MySqlBin = 'C:\Program Files\MySQL\MySQL Server 8.0\bin')
$ErrorActionPreference = 'Stop'
$checks = [ordered]@{}
$checks.Windows = (Get-CimInstance Win32_OperatingSystem).Caption
$checks.Node = if (Get-Command node -ErrorAction SilentlyContinue) { node --version } else { 'AUSENTE' }
$checks.Node24 = "$($checks.Node)" -match '^v24\.'
$checks.Git = if (Get-Command git -ErrorAction SilentlyContinue) { git --version } else { 'AUSENTE' }
$checks.MySqlClient = Test-Path -LiteralPath (Join-Path $MySqlBin 'mysql.exe')
$checks.MySqlServerBinary = Test-Path -LiteralPath (Join-Path $MySqlBin 'mysqld.exe')
$checks.MySqlService = [bool](Get-Service -Name 'MySQL*' -ErrorAction SilentlyContinue | Where-Object Status -eq 'Running')
$checks.Caddy = [bool](Get-Command caddy -ErrorAction SilentlyContinue)
$checks.WinSW = [bool](Get-Command winsw -ErrorAction SilentlyContinue)
$checks.ListeningPorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -in 80,443,3306 | Select-Object LocalAddress,LocalPort)
[pscustomobject]$checks | Format-List
if (-not $checks.Node24) { Write-Warning 'Instale Node.js 24 no host antes da implantação.' }
if (-not $checks.MySqlService) { Write-Warning 'O serviço MySQL não está em execução. Nenhum banco foi consultado.' }
if (-not $checks.Caddy) { Write-Warning 'Caddy ainda precisa ser instalado/provisionado.' }
if (-not $checks.WinSW) { Write-Warning 'WinSW ainda precisa ser provisionado.' }
