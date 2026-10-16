[CmdletBinding()]
param([string]$MySqlBin = 'C:\Program Files\MySQL\MySQL Server 8.0\bin')

$ErrorActionPreference = 'Continue'
$rules = Import-PowerShellDataFile (Join-Path $PSScriptRoot '../../../tools/gestoros-diagnostico/Homologation.Rules.psd1')
$checks = [ordered]@{}
$windows = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue
$checks.Windows = if ($windows.ProductName) { $windows.ProductName } else { 'não identificado sem acesso ao registro' }
$checks.Node = if (Get-Command node -ErrorAction SilentlyContinue) { (& node --version | Out-String).Trim() } else { 'AUSENTE' }
$checks.Node24 = "$($checks.Node)" -match ('^v' + $rules.NodeMajor + '\.')
$checks.Git = if (Get-Command git -ErrorAction SilentlyContinue) { (& git --version | Out-String).Trim() } else { 'AUSENTE' }

$mysqlServer = Join-Path $MySqlBin 'mysqld.exe'
$mysqlClient = Join-Path $MySqlBin 'mysql.exe'
$checks.MySqlClient = Test-Path -LiteralPath $mysqlClient
$checks.MySqlServerBinary = Test-Path -LiteralPath $mysqlServer
$checks.MySqlServerVersion = 'AUSENTE'
$checks.MySqlServerVersionIs80046 = $false
if ($checks.MySqlServerBinary) {
  $versionOutput = (& $mysqlServer --version 2>$null | Out-String).Trim()
  $versionMatch = [regex]::Match($versionOutput, 'Ver\s+([0-9]+\.[0-9]+\.[0-9]+)')
  if ($versionMatch.Success) {
    $checks.MySqlServerVersion = $versionMatch.Groups[1].Value
    $checks.MySqlServerVersionIs80046 = $checks.MySqlServerVersion -eq $rules.MySqlVersion
  } else {
    $checks.MySqlServerVersion = 'não identificada'
  }
}

$mysqlServices = @(Get-Service -Name 'MySQL*' -ErrorAction SilentlyContinue)
$checks.MySqlServices = if ($mysqlServices.Count) {
  ($mysqlServices | ForEach-Object { "$($_.Name): $($_.Status), início $($_.StartType)" }) -join '; '
} else {
  'nenhum serviço MySQL encontrado'
}
$checks.MySqlConfig = 'não identificado'
$checks.MySqlPort = '3306 (padrão; configuração não identificada)'
foreach ($service in $mysqlServices) {
  $serviceKey = "HKLM:\SYSTEM\CurrentControlSet\Services\$($service.Name)"
  $serviceConfig = Get-ItemProperty -LiteralPath $serviceKey -ErrorAction SilentlyContinue
  $imagePath = [string]$serviceConfig.ImagePath
  $defaultsMatch = [regex]::Match($imagePath, '--defaults-file=(?:"([^"]+)"|([^\s]+))')
  $configPath = if ($defaultsMatch.Success) {
    if ($defaultsMatch.Groups[1].Success) { $defaultsMatch.Groups[1].Value } else { $defaultsMatch.Groups[2].Value }
  } else {
    @('C:\ProgramData\MySQL\MySQL Server 8.0\my.ini', 'C:\Windows\my.ini', 'C:\my.ini') |
      Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  }

  if ($configPath -and (Test-Path -LiteralPath $configPath)) {
    $checks.MySqlConfig = $configPath
    $section = ''
    foreach ($line in Get-Content -LiteralPath $configPath -ErrorAction SilentlyContinue) {
      if ($line -match '^\s*\[(.+)\]\s*$') { $section = $Matches[1]; continue }
      if ($section -ieq 'mysqld' -and $line -match '^\s*port\s*=\s*(\d+)') {
        $checks.MySqlPort = $Matches[1]
        break
      }
    }
    break
  }
}

$checks.MySqlListening = 'verificação indisponível'
try {
  $port = [int]($checks.MySqlPort -replace '[^0-9].*$', '')
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop)
  $checks.MySqlListening = if ($listeners.Count) { ($listeners | ForEach-Object LocalAddress | Sort-Object -Unique) -join ', ' } else { 'nenhum listener encontrado na porta configurada' }
} catch {}
if ($checks.MySqlListening -eq 'verificação indisponível') {
  $port = [int]($checks.MySqlPort -replace '[^0-9].*$', '')
  $listeners = @(netstat.exe -ano -p tcp 2>$null | Select-String -Pattern "^\s*TCP\s+(\S+):$port\s+\S+\s+LISTENING\s+\d+\s*$" | ForEach-Object {
    if ($_.Line -match "^\s*TCP\s+(\S+):$port\s+\S+\s+LISTENING\s+\d+\s*$") { $Matches[1] }
  })
  if ($listeners.Count) { $checks.MySqlListening = ($listeners | Sort-Object -Unique) -join ', ' }
}

$checks.Caddy = [bool](Get-Command caddy -ErrorAction SilentlyContinue) -or (Test-Path -LiteralPath 'C:\Program Files\GestorOS\caddy.exe')
$checks.WinSW = [bool](Get-Command winsw -ErrorAction SilentlyContinue) -or (Test-Path -LiteralPath 'C:\Program Files\GestorOS\GestorOSBackend.exe')
$checks.HomologationServices = (@(Get-Service -Name @($rules.Services | Where-Object { $_ -ne 'MySQL80' }) -ErrorAction SilentlyContinue) | ForEach-Object { "$($_.Name): $($_.Status), início $($_.StartType)" }) -join '; '
if (-not $checks.HomologationServices) { $checks.HomologationServices = 'não instalados' }
try {
  $checks.FirewallProfiles = (Get-NetFirewallProfile -ErrorAction Stop | ForEach-Object { "$($_.Name): $($_.Enabled)" }) -join '; '
} catch {
  $checks.FirewallProfiles = 'não foi possível consultar sem elevação/permissão'
}

[pscustomobject]$checks | Format-List
if (-not $checks.Node24) { Write-Warning 'Instale Node.js 24 no host antes da implantação.' }
if ($mysqlServices.Count -eq 0) { Write-Warning 'Nenhum serviço MySQL encontrado. Nenhum banco foi consultado.' }
if ($mysqlServices | Where-Object Status -ne 'Running') {
  Write-Warning 'Há serviço MySQL parado. Após confirmar o host correto, um administrador pode usar Start-Service -Name <nome-do-serviço> e consultar o Log de Aplicativo/Sistema para a causa se o início falhar.'
}
if (-not $checks.MySqlServerVersionIs80046) { Write-Warning 'A versão instalada não foi confirmada como MySQL 8.0.46.' }
if ($checks.MySqlListening -match '(^|,\s*)(0\.0\.0\.0|\[::\])($|,)' ) {
  Write-Warning 'MySQL está escutando em todas as interfaces. Antes da homologação, um administrador deve verificar/restringir o acesso de entrada à porta 3306; nenhuma alteração de rede foi aplicada.'
}
if (-not $checks.Caddy) { Write-Warning 'Caddy ainda precisa ser obtido/provisionado pelo administrador.' }
if (-not $checks.WinSW) { Write-Warning 'WinSW ainda precisa ser obtido/provisionado pelo administrador.' }
