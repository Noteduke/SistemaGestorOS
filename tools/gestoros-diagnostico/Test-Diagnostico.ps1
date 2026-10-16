[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'GestorOS-Diagnostico.ps1') -LibraryOnly
$script:passed=0
function Assert($Condition, $Message) {
  if (-not $Condition) { throw "FALHOU: $Message" }
  $script:passed++
}
function Find($Report, $Item) { $Report.Resultados | Where-Object Item -eq $Item | Select-Object -First 1 }
# Deterministic providers: never access services, network or a database in these scenarios.
function Get-CimInstance {
  param($ClassName)
  if ($script:scenario -eq 'denied') { throw [UnauthorizedAccessException]::new() }
  if ($ClassName -eq 'Win32_OperatingSystem') { return [pscustomobject]@{Caption='Microsoft Windows 10 Pro'; OSArchitecture='64-bit'} }
  if ($script:scenario -eq 'absent') { return }
  foreach ($name in $script:Rules.Services) {
    [pscustomobject]@{Name=$name; State=$(if ($script:scenario -eq 'partial') {'Stopped'} else {'Running'}); StartMode='Auto'}
  }
}
function Get-NetIPAddress { [pscustomobject]@{IPAddress='192.168.1.10'; AddressState='Preferred'} }
function Get-NetTCPConnection {
  if ($script:scenario -eq 'denied') { throw [UnauthorizedAccessException]::new() }
  if ($script:scenario -in @('absent','partial')) { return }
  foreach ($p in $script:Rules.Ports) { [pscustomobject]@{LocalPort=$p; LocalAddress='127.0.0.1'} }
}
function Get-NetFirewallProfile { [pscustomobject]@{Enabled=$true} }
function Get-NetFirewallRule { return }
$originalBinary = ${function:Get-BinaryVersion}
function Get-BinaryVersion {
  param($Name,$Directory,$Pattern)
  if ($script:scenario -eq 'absent') { return Test-Observation $Name 'Ausente' $Pattern 'Provisionar dependência.' $true }
  if ($script:scenario -eq 'partial' -and $Name -eq 'node') { return Test-Observation $Name '22.0.0' '24.x' 'Atualizar Node.' $true }
  New-Result $Name 'OK' 'Versão compatível' $Pattern 'Nenhuma ação.'
}
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('gos-diagnostic-test-'+[guid]::NewGuid().ToString('N'))
try {
  foreach ($dir in @('backend\dist','frontend\dist','config','files','company-assets','logs','backups')) {
    New-Item -ItemType Directory -Path (Join-Path $fixture $dir) -Force | Out-Null
  }
  foreach ($file in @('backend\dist\main.js','backend\package.json','frontend\dist\index.html','config\Caddyfile','backups\sample.sql')) {
    Set-Content -LiteralPath (Join-Path $fixture $file) -Value 'fixture' -Encoding UTF8
  }
  $sentinel='SECRET_SENTINEL_MUST_NEVER_APPEAR'
  Set-Content -LiteralPath (Join-Path $fixture 'config\.env.homologation') -Value "DATABASE_URL=mysql://user:$sentinel@localhost/gestor_os" -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $fixture 'frontend\dist\app.js') -Value $script:Rules.Marker -Encoding UTF8
  @{environment='homologation'; homologationMarkerVerified=$true; sourceCommit=('a'*40); frontendVersion='1.0.0'; token=$sentinel} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $fixture 'frontend\build-info.json') -Encoding UTF8
  $before=@(Get-ChildItem -LiteralPath $fixture -Recurse -File | Get-FileHash | Select-Object Path,Hash) | ConvertTo-Json
  foreach ($scenario in @('absent','partial','complete','denied')) {
    $script:scenario=$scenario
    $root=if ($scenario -eq 'absent') {Join-Path $fixture 'missing'} else {$fixture}
    $report=Get-Diagnostic $root '' '' (Join-Path $fixture 'backups') ''
    Assert ($report.Resultados.Count -gt 25) "$scenario retorna lista de inspeções"
    Assert ((Find $report 'Teste de restauração').Verificacao -eq 'Não verificado') 'Backup não certifica restauração'
    $json=$report | ConvertTo-Json -Depth 8
    $txt=ConvertTo-ReportText $report
    Assert (-not $json.Contains($sentinel) -and -not $txt.Contains($sentinel)) 'Sem conteúdo sensível nos relatórios'
    Assert (($json | ConvertFrom-Json).Resultados.Count -eq $report.Resultados.Count) 'JSON serializável'
    switch ($scenario) {
      absent {
        Assert ((Find $report 'node').Estado -eq 'PENDENTE') 'Dependência ausente'
        Assert ((Find $report 'Diretório backend').Estado -eq 'PENDENTE') 'Diretório inexistente'
        Assert ((Find $report 'Serviço MySQL80').Estado -eq 'PENDENTE') 'Ambiente não instalado'
      }
      partial {
        Assert ((Find $report 'node').Estado -eq 'PENDENTE') 'Versão incompatível'
        Assert ((Find $report 'Serviço MySQL80').Estado -eq 'PENDENTE') 'Serviço parado'
        Assert ((Find $report 'Porta 3100').Estado -eq 'PENDENTE') 'Porta indisponível'
      }
      complete {
        foreach ($item in @('Serviço MySQL80','Porta 3100','Manifesto de versão','Marcador de homologação','Arquivos de backup')) {
          Assert ((Find $report $item).Estado -eq 'OK') "Ambiente configurado: $item"
        }
        Assert ((Find $report 'Configuração Backend / Frontend / banco').Verificacao -eq 'Não verificado') 'Banco não conectado mesmo no cenário completo'
      }
      denied {
        Assert ((Find $report 'Serviços').Verificacao -eq 'Não verificado') 'Permissão insuficiente em serviços'
        Assert ((Find $report 'Portas e interfaces').Estado -eq 'ATENÇÃO') 'Acesso negado não vira falha'
      }
    }
  }
  $after=@(Get-ChildItem -LiteralPath $fixture -Recurse -File | Get-FileHash | Select-Object Path,Hash) | ConvertTo-Json
  Assert ($before -eq $after) 'Nenhum arquivo inspecionado foi alterado'
  $originalItem = ${function:Get-Item}
  function Get-Item { throw [UnauthorizedAccessException]::new() }
  Assert ((Test-LocalPath 'Acesso negado' $fixture).Verificacao -eq 'Não verificado') 'Caminho sem permissão não é ausente'
  if ($originalItem) { Set-Item Function:Get-Item $originalItem } else { Remove-Item Function:Get-Item }
  $script:scenario='complete'
  $example=Get-Diagnostic $fixture '' '' (Join-Path $fixture 'backups') ''
  $example.Computador='EXEMPLO-SIMULADO'; $example.DataHora='2026-10-16T12:00:00-03:00'
  $example | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'exemplo-relatorio.json') -Encoding UTF8
  ConvertTo-ReportText $example | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'exemplo-relatorio.txt') -Encoding UTF8
  # AST safety regression: the application must not gain mutation or SQL invocations.
  $tokens=$null; $errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'GestorOS-Diagnostico.ps1'),[ref]$tokens,[ref]$errors)
  Assert ($errors.Count -eq 0) 'Sintaxe compatível com PowerShell 5.1'
  foreach ($scriptName in @('Test-HomologationPrerequisites.ps1','Build-HomologationFrontend.ps1','Deploy-HomologationArtifacts.ps1','Verify-HomologationServices.ps1')) {
    $sharedScript=Join-Path $PSScriptRoot "..\..\scripts\homologation\windows10\$scriptName"
    if (Test-Path -LiteralPath $sharedScript) {
      $sharedErrors=$null
      [void][Management.Automation.Language.Parser]::ParseFile((Resolve-Path $sharedScript),[ref]$tokens,[ref]$sharedErrors)
      Assert ($sharedErrors.Count -eq 0) "Sintaxe do consumidor de regras: $scriptName"
    }
  }
  $commands=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.CommandAst]},$true) | ForEach-Object GetCommandName)
  Assert (@($commands | Where-Object { $_ -match '^(Set-Service|Start-Service|Stop-Service|Restart-Service|New-NetFirewallRule|Set-NetFirewallRule|Remove-|mysql|mysqld|npm|node|Invoke-Expression|Invoke-Sqlcmd)$' }).Count -eq 0) 'Sem comandos de alteração ou conexão SQL'
  Write-Output "$script:passed verificações aprovadas. Fixtures simuladas; nenhum banco conectado."
} finally {
  # Delete only the unique test directory created above, after checking its boundary.
  $resolved=[IO.Path]::GetFullPath($fixture)
  $temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolved.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolved) -match '^gos-diagnostic-test-[a-f0-9]{32}$') {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
