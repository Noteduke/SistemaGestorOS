[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$rules = Import-PowerShellDataFile (Join-Path $PSScriptRoot '../../../tools/gestoros-diagnostico/Homologation.Rules.psd1')
$services = @(Get-CimInstance Win32_Service | Where-Object Name -in @($rules.Services | Where-Object { $_ -ne 'MySQL80' }))
if ($services.Count -ne 2) { throw 'Os dois serviços de homologação não estão registrados.' }
$services | Select-Object Name,State,StartMode,StartName,PathName | Format-Table -AutoSize
if ($services | Where-Object { $_.State -ne 'Running' -or $_.StartMode -ne 'Auto' }) { throw 'Serviços não estão ativos com início automático.' }
$backend = Test-NetConnection -ComputerName 127.0.0.1 -Port 3100 -WarningAction SilentlyContinue
$https = Test-NetConnection -ComputerName 127.0.0.1 -Port 443 -WarningAction SilentlyContinue
if (-not $backend.TcpTestSucceeded -or -not $https.TcpTestSucceeded) { throw 'Backend local (3100) ou HTTPS local (443) não está escutando.' }
Write-Output 'Serviços ativos, inicialização automática e portas locais verificadas. Nenhum banco foi consultado.'
