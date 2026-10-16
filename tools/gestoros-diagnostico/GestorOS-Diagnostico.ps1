[CmdletBinding()]
param(
  [string]$InstallRoot = '',
  [string]$BinaryDirectory = '',
  [string]$MySqlBin = '',
  [string]$BackupDirectory = '',
  [string]$HttpsHost = '',
  [switch]$Console,
  [switch]$LibraryOnly
)

# Windows PowerShell 5.1. No configuration secrets or database connections are read.
$script:DiagnosticVersion = '1.0.0'
$script:Rules = Import-PowerShellDataFile (Join-Path $PSScriptRoot 'Homologation.Rules.psd1')

function New-Result {
  param($Item, $State, $Found, $Expected, $Correction, [bool]$Admin = $false, [bool]$Verified = $true)
  [pscustomobject][ordered]@{ Item=$Item; Estado=$State; Verificacao=$(if ($Verified) {'Verificado'} else {'Não verificado'}); Encontrado=$Found; Esperado=$Expected; Correcao=$Correction; ExigeAdministrador=$Admin }
}
function Test-Observation {
  param($Item, $Actual, $Expected, $Correction, [bool]$Admin=$false, [bool]$Available=$true)
  if (-not $Available) { return New-Result $Item 'ATENÇÃO' 'Não verificado: inspeção indisponível ou acesso insuficiente.' $Expected $Correction $Admin $false }
  $ok = [string]$Actual -eq [string]$Expected
  New-Result $Item $(if ($ok) {'OK'} else {'PENDENTE'}) ([string]$Actual) ([string]$Expected) $Correction $Admin
}
function Test-LocalPath {
  param($Label, $Path, [string]$Type='Container')
  if (-not $Path) { return New-Result $Label 'ATENÇÃO' 'Não verificado: caminho não informado.' 'Caminho configurado e acessível' 'Informe o caminho na janela ou nos parâmetros.' $false $false }
  try {
    $entry = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    $ok = if ($Type -eq 'Container') { $entry.PSIsContainer } else { -not $entry.PSIsContainer }
    Test-Observation $Label $ok $true 'Revise o caminho e provisione o artefato pelo procedimento de homologação.'
  } catch [System.Management.Automation.ItemNotFoundException] {
    New-Result $Label 'PENDENTE' 'Caminho inexistente.' 'Caminho configurado e acessível' 'Revise o caminho e prepare os diretórios/artefatos de homologação.'
  } catch { Test-Observation $Label '' 'Caminho acessível' 'Solicite revisão das permissões de leitura.' $true $false }
}
function Get-BinaryVersion {
  param($Name, $Directory, $Pattern)
  $exe = $null
  if ($Directory) {
    try { $exe = (Get-Item -LiteralPath (Join-Path $Directory "$Name.exe") -ErrorAction Stop).FullName }
    catch [System.Management.Automation.ItemNotFoundException] { return New-Result $Name 'PENDENTE' 'Executável ausente no diretório informado.' $Pattern 'Revise o diretório de binários.' $true }
    catch { return Test-Observation $Name '' $Pattern 'Solicite acesso ao executável.' $true $false }
  } else { $exe = (Get-Command "$Name.exe" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source }
  if (-not $exe) { return New-Result $Name 'PENDENTE' 'Não localizado no PATH.' $Pattern 'Informe o diretório ou solicite provisionamento ao administrador.' $true }
  # Read PE metadata only: never execute discovered binaries, npm scripts or service wrappers.
  try {
    $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($exe).ProductVersion
    if (-not $version) { return Test-Observation $Name '' $Pattern 'Confira a versão do binário pela fonte oficial.' $false $false }
    $numeric = [regex]::Match($version, '\d+\.\d+(?:\.\d+)?').Value
    if (-not $numeric) { return Test-Observation $Name '' $Pattern 'Confira manualmente a versão; metadados sem versão numérica reconhecida.' $false $false }
    $ok = if ($Name -eq 'node') { $numeric -match ('^' + $script:Rules.NodeMajor + '\.') } elseif ($Name -eq 'mysqld') { $numeric -eq $script:Rules.MySqlVersion } else { $true }
    New-Result $Name $(if ($ok) {'OK'} else {'PENDENTE'}) $numeric $Pattern 'Solicite ao administrador a versão prevista e verifique a procedência do binário.' $true
  } catch { Test-Observation $Name '' $Pattern 'Solicite acesso aos metadados do executável.' $true $false }
}
function Get-Diagnostic {
  param($Root, $Bin, $SqlBin, $Backup, $HostName)
  $results = New-Object 'System.Collections.Generic.List[object]'
  try {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    $osName = if ($os.Caption -match 'Windows 10') {'Windows 10'} else {'Outro Windows'}
    $results.Add((Test-Observation 'Sistema operacional' $osName 'Windows 10' 'Confirme o host Windows 10 de homologação.' $true))
    $results.Add((Test-Observation 'Arquitetura' ($os.OSArchitecture -match '64') $true 'Use o sistema e binários x64 previstos.' $true))
  } catch { $results.Add((Test-Observation 'Sistema operacional' '' 'Windows 10 x64' 'Solicite acesso à consulta CIM.' $false $false)) }
  $results.Add((Test-Observation 'PowerShell' ($PSVersionTable.PSVersion -ge [version]'5.1') $true 'Use Windows PowerShell 5.1 ou superior.'))
  try {
    $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.IPAddress -notlike '127.*' -and $_.AddressState -eq 'Preferred' })
    $results.Add((New-Result 'Rede IPv4' $(if ($ips.Count) {'OK'} else {'PENDENTE'}) (($ips | ForEach-Object IPAddress) -join ', ') 'IPv4 ativo na rede interna' 'Confira o adaptador, DHCP/IP e DNS. IP ativo não comprova acesso dos clientes.'))
  } catch { $results.Add((Test-Observation 'Rede IPv4' '' 'IPv4 interno ativo' 'Revise o acesso à inspeção de rede.' $false $false)) }
  $results.Add((Get-BinaryVersion 'node' '' 'Node.js 24.x'))
  $results.Add((Get-BinaryVersion 'git' '' 'Git instalado (sem versão mínima definida)'))
  $results.Add((Get-BinaryVersion 'mysqld' $SqlBin $script:Rules.MySqlVersion))
  $npm = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  $results.Add((Test-Observation 'npm disponível' ([bool]$npm) $true 'Provisione npm junto ao Node.js 24.'))
  try {
    if (-not $npm) { throw 'Unavailable' }
    $npmPackage = Join-Path (Split-Path $npm.Source) 'node_modules\npm\package.json'
    $npmVersion = (Get-Content -LiteralPath $npmPackage -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop).version
    if ($npmVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Unrecognized version' }
    $results.Add((New-Result 'Versão npm' 'OK' $npmVersion 'npm distribuído com Node.js 24; sem versão fixa definida' 'Confira a procedência do pacote; a compatibilidade funcional exige testes de build.'))
  } catch { $results.Add((Test-Observation 'Versão npm' '' 'npm distribuído com Node.js 24' 'Confira a distribuição oficial; scripts npm não são executados.' $false $false)) }
  foreach ($binary in @('caddy','GestorOSBackend','GestorOSCaddy')) {
    $results.Add((Get-BinaryVersion $binary $Bin $(if ($binary -eq 'caddy') {'Caddy instalado'} else {'WinSW instalado (wrapper)'})))
  }
  try {
    $services = @(Get-CimInstance Win32_Service -ErrorAction Stop)
    foreach ($name in $script:Rules.Services) {
      $service = $services | Where-Object Name -eq $name | Select-Object -First 1
      $results.Add((Test-Observation "Serviço $name" $(if ($service) {$service.State} else {'Ausente'}) 'Running' 'Administrador: revise instalação, logs e início do serviço correto.' $true))
      $results.Add((Test-Observation "Início $name" $(if ($service) {$service.StartMode} else {'Ausente'}) 'Auto' 'Administrador: configure início automático no procedimento aprovado.' $true))
    }
  } catch { $results.Add((Test-Observation 'Serviços' '' 'Serviços ativos e automáticos' 'Solicite acesso à consulta de serviços.' $true $false)) }
  try {
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop)
    foreach ($port in $script:Rules.Ports) {
      $rows = @($listeners | Where-Object LocalPort -eq $port)
      $results.Add((Test-Observation "Porta $port" ($rows.Count -gt 0) $true 'Revise o serviço e a porta configurada; um listener não comprova a identidade do processo.' $true))
      if ($rows.Count) {
        $external = @($rows | Where-Object { $_.LocalAddress -notin @('127.0.0.1','::1') })
        $risk = $port -in @(3306,3100) -and $external.Count -gt 0
        $results.Add((New-Result "Interfaces $port" $(if ($risk) {'ATENÇÃO'} else {'OK'}) (($rows | ForEach-Object LocalAddress | Sort-Object -Unique) -join ', ') $(if ($port -eq 443) {'HTTPS na rede interna'} else {'Somente loopback'}) 'Revise bind e restrições do Firewall com o administrador.' $true))
      }
    }
  } catch { $results.Add((Test-Observation 'Portas e interfaces' '' '3306, 3100 e 443 em escuta' 'Solicite acesso à tabela TCP.' $true $false)) }
  try {
    $profiles = @(Get-NetFirewallProfile -ErrorAction Stop)
    $results.Add((Test-Observation 'Firewall habilitado' (@($profiles | Where-Object { -not $_.Enabled }).Count -eq 0) $true 'Administrador: revise os perfis do Firewall.' $true))
    $inbound = @(Get-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -ErrorAction Stop)
    $count = 0
    foreach ($rule in $inbound) {
      $filters = @($rule | Get-NetFirewallPortFilter -ErrorAction Stop)
      if (@($filters | Where-Object { $_.Protocol -in @('TCP','6','Any') -and (@($_.LocalPort) -join ',') -match '(^|,)(Any|443|3100|3306)(,|$)|-' }).Count) { $count++ }
    }
    $results.Add((New-Result 'Regras relevantes do Firewall' 'ATENÇÃO' "$count regras de entrada potencialmente relevantes (inclui Any/faixas)." '443 restrita à LAN; 3100/3306 protegidas' 'Administrador: confira escopo remoto, perfis, regras de bloqueio, programa e portas. Contagem não certifica isolamento.'))
  } catch { $results.Add((Test-Observation 'Firewall' '' 'Política de entrada restrita à LAN' 'Solicite inspeção administrativa do Firewall.' $true $false)) }
  foreach ($relative in @('backend','frontend','files','company-assets','config','logs')) {
    $results.Add((Test-LocalPath "Diretório $relative" $(if ($Root) {Join-Path $Root $relative})))
  }
  foreach ($relative in @('backend\dist\main.js','backend\package.json','frontend\dist\index.html','config\.env.homologation','config\Caddyfile')) {
    $results.Add((Test-LocalPath "Arquivo $relative" $(if ($Root) {Join-Path $Root $relative}) 'Leaf'))
  }
  if ($Root) {
    try {
      $manifest = Get-Content -LiteralPath (Join-Path $Root 'frontend\build-info.json') -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
      $valid = $manifest.environment -eq 'homologation' -and $manifest.homologationMarkerVerified -eq $true -and $manifest.sourceCommit -match '^[a-f0-9]{40}$' -and $manifest.frontendVersion -match '^\d+\.\d+\.\d+'
      $results.Add((Test-Observation 'Manifesto de versão' $valid $true 'Refaça build e deploy pelos scripts oficiais.'))
      # Do not export arbitrary manifest values.
    } catch [System.Management.Automation.ItemNotFoundException] { $results.Add((New-Result 'Manifesto de versão' 'PENDENTE' 'Ausente.' 'frontend/build-info.json válido' 'Execute build e deploy de homologação.')) }
    catch { $results.Add((Test-Observation 'Manifesto de versão' '' 'Manifesto legível e válido' 'Confira formato e permissões do manifesto.' $false $false)) }
    try {
      $bundles = @(Get-ChildItem -LiteralPath (Join-Path $Root 'frontend\dist') -Recurse -File -ErrorAction Stop | Where-Object Extension -in @('.js','.css'))
      $found = $false
      foreach ($bundle in $bundles) {
        if (Select-String -LiteralPath $bundle.FullName -SimpleMatch -Pattern $script:Rules.Marker -Quiet -ErrorAction Stop) { $found=$true; break }
      }
      $results.Add((Test-Observation 'Marcador de homologação' $found $true 'Refaça o frontend com Build-HomologationFrontend.ps1.'))
    } catch { $results.Add((Test-Observation 'Marcador de homologação' '' $script:Rules.Marker 'Confira artefatos e permissões de leitura.' $false $false)) }
  } else { $results.Add((Test-Observation 'Build e manifesto' '' 'Artefato homologation válido' 'Informe o diretório de instalação.' $false $false)) }
  $results.Add((New-Result 'Configuração Backend / Frontend / banco' 'ATENÇÃO' 'Não verificado: conteúdo de .env e credenciais não são lidos; nenhuma conexão SQL é aberta.' 'Ambiente homologation; banco gestor_os_homologation; efeitos externos desativados; cookie seguro; backend loopback:3100; frontend /api/v1' 'Responsável deve conferir localmente a configuração usando Homologation.env.template e Caddyfile.homologation.template. Nunca usar gestor_os.' $false $false))
  $results.Add((Test-LocalPath 'Destino de backup' $Backup))
  if ($Backup) {
    try {
      $files = @(Get-ChildItem -LiteralPath $Backup -File -ErrorAction Stop | Where-Object { $_.Name -match '\.(sql|dump|zip|gz|bak)$' })
      $results.Add((Test-Observation 'Arquivos de backup' ($files.Count -gt 0) $true 'Configure backup exclusivo da homologação; confira conclusão, integridade e retenção.'))
    } catch { $results.Add((Test-Observation 'Arquivos de backup' '' 'Backup acessível' 'Confira destino e permissões de leitura.' $false $false)) }
  }
  $results.Add((New-Result 'Teste de restauração' 'ATENÇÃO' 'Não verificado: existência de arquivos não valida restauração.' 'Evidência operacional de restauração em banco separado' 'Registre data, responsável, banco de ensaio e resultado do teste por procedimento separado.' $false $false))
  if ($HostName -and $HostName -match '^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$' -and $HostName -notmatch '\.\.') {
    try {
      $request = [Net.HttpWebRequest]::Create("https://$HostName/")
      $request.Method='HEAD'; $request.Timeout=5000; $request.ReadWriteTimeout=5000
      $request.AllowAutoRedirect=$false; $request.Proxy=$null
      $response=$request.GetResponse()
      try { $httpsOk = [int]$response.StatusCode -eq 200 } finally { $response.Close() }
      $results.Add((Test-Observation 'HTTPS interno' $httpsOk $true 'Confira DNS interno, certificado confiável e publicação Caddy.'))
    } catch { $results.Add((New-Result 'HTTPS interno' 'ATENÇÃO' 'Não foi possível confirmar HTTPS confiável (DNS, rede, certificado ou resposta HTTP).' 'HTTPS confiável com HTTP 200' 'Revise DNS, Caddy e confiança da CA; valide também em cada cliente.')) }
  } else { $results.Add((Test-Observation 'HTTPS interno' '' 'Hostname interno sem URL/credenciais' 'Informe somente o hostname interno para uma requisição HEAD sem credenciais.' $false $false)) }
  [pscustomobject][ordered]@{
    Programa='Gestor OS — Diagnóstico de Ambiente'; Versao=$script:DiagnosticVersion
    Computador=$env:COMPUTERNAME; DataHora=(Get-Date).ToString('o')
    SistemaOperacional=$(if ($os) { $osName } else {'Não verificado'})
    Resultados=@($results.ToArray())
    Problemas=@($results.ToArray() | Where-Object Estado -ne 'OK' | ForEach-Object Item)
    Aviso='Somente leitura. Nenhum banco conectado ou alterado. Não substitui os testes funcionais da Homologação 1.'
  }
}
function ConvertTo-ReportText {
  param($Report)
  $lines = @($Report.Programa, "Versão: $($Report.Versao)", "Computador: $($Report.Computador)", "Sistema: $($Report.SistemaOperacional)", "Data: $($Report.DataHora)", $Report.Aviso, '')
  foreach ($row in $Report.Resultados) {
    $lines += "[$($row.Estado)] $($row.Item) — $($row.Verificacao)`r`nEncontrado: $($row.Encontrado)`r`nEsperado: $($row.Esperado)`r`nComo corrigir: $($row.Correcao)`r`nExige administrador: $($row.ExigeAdministrador)`r`n"
  }
  ($lines -join "`r`n").TrimEnd()
}
if ($LibraryOnly) { return }
if ($Console) { Get-Diagnostic $InstallRoot $BinaryDirectory $MySqlBin $BackupDirectory $HttpsHost; return }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object Windows.Forms.Form
$form.Text='Gestor OS — Diagnóstico de Ambiente'; $form.Size=New-Object Drawing.Size(1150,760)
$form.MinimumSize=New-Object Drawing.Size(950,650); $form.StartPosition='CenterScreen'
$layout = New-Object Windows.Forms.TableLayoutPanel
$layout.Dock='Fill'; $layout.ColumnCount=1; $layout.RowCount=4
$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle('Absolute',180))) | Out-Null
$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle('Percent',65))) | Out-Null
$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle('Percent',35))) | Out-Null
$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle('Absolute',45))) | Out-Null
$form.Controls.Add($layout)
$config = New-Object Windows.Forms.TableLayoutPanel
$config.Dock='Fill'; $config.ColumnCount=2; $config.RowCount=6
$config.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Absolute',220))) | Out-Null
$config.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',100))) | Out-Null
$header=New-Object Windows.Forms.Label; $header.Text="Versão $script:DiagnosticVersion | $env:COMPUTERNAME | $(Get-Date -Format 'dd/MM/yyyy HH:mm') | SOMENTE LEITURA"; $header.AutoSize=$true
$config.Controls.Add($header,0,0); $config.SetColumnSpan($header,2)
$inputs=@()
$labels=@('Instalação Gestor OS','Binários Caddy / WinSW','Binários MySQL','Destino de backup','Hostname HTTPS (opcional)')
$values=@($InstallRoot,$BinaryDirectory,$MySqlBin,$BackupDirectory,$HttpsHost)
for ($i=0; $i -lt 5; $i++) {
  $label=New-Object Windows.Forms.Label; $label.Text=$labels[$i]; $label.AutoSize=$true
  $box=New-Object Windows.Forms.TextBox; $box.Dock='Fill'; $box.Text=$values[$i]
  $config.Controls.Add($label,0,($i+1)); $config.Controls.Add($box,1,($i+1)); $inputs+= $box
}
$layout.Controls.Add($config,0,0)
$grid=New-Object Windows.Forms.DataGridView
$grid.Dock='Fill'; $grid.ReadOnly=$true; $grid.AllowUserToAddRows=$false; $grid.AllowUserToDeleteRows=$false
$grid.AutoSizeColumnsMode='Fill'; $grid.SelectionMode='FullRowSelect'; $grid.MultiSelect=$false
foreach ($col in @('Item','Estado','Verificacao')) { [void]$grid.Columns.Add($col,$col) }
$layout.Controls.Add($grid,0,1)
$details=New-Object Windows.Forms.TextBox; $details.Multiline=$true; $details.ReadOnly=$true; $details.ScrollBars='Vertical'; $details.Dock='Fill'
$layout.Controls.Add($details,0,2)
$buttons=New-Object Windows.Forms.FlowLayoutPanel; $buttons.Dock='Fill'; $layout.Controls.Add($buttons,0,3)
$script:report=$null
$refresh={
  $form.UseWaitCursor=$true; $buttons.Enabled=$false
  try {
    $script:report=Get-Diagnostic $inputs[0].Text $inputs[1].Text $inputs[2].Text $inputs[3].Text $inputs[4].Text
    $header.Text="Versão $script:DiagnosticVersion | $env:COMPUTERNAME | $($script:report.DataHora) | SOMENTE LEITURA"
    $grid.Rows.Clear()
    foreach ($r in $script:report.Resultados) {
      $index=$grid.Rows.Add($r.Item,$r.Estado,$r.Verificacao); $grid.Rows[$index].Tag=$r
      $grid.Rows[$index].DefaultCellStyle.BackColor= switch ($r.Estado) {'OK' {[Drawing.Color]::Honeydew} 'PENDENTE' {[Drawing.Color]::MistyRose} default {[Drawing.Color]::LemonChiffon}}
    }
  } catch { [void][Windows.Forms.MessageBox]::Show('Diagnóstico interrompido. Confira os caminhos e permissões. Nenhuma alteração foi aplicada.') }
  finally { $form.UseWaitCursor=$false; $buttons.Enabled=$true }
}
$grid.add_SelectionChanged({
  if ($grid.SelectedRows.Count -and $grid.SelectedRows[0].Tag) {
    $r=$grid.SelectedRows[0].Tag
    $details.Text="Encontrado: $($r.Encontrado)`r`nEsperado: $($r.Esperado)`r`nComo corrigir: $($r.Correcao)`r`nExige administrador: $($r.ExigeAdministrador)`r`n$($r.Verificacao)"
  }
})
foreach ($caption in @('Verificar novamente','Salvar relatório','Copiar relatório','Como corrigir','Fechar')) {
  $b=New-Object Windows.Forms.Button; $b.Text=$caption; $b.AutoSize=$true; $buttons.Controls.Add($b)
  switch ($caption) {
    'Verificar novamente' { $b.add_Click($refresh) }
    'Salvar relatório' { $b.add_Click({
      if (-not $script:report) { return }
      $dialog=New-Object Windows.Forms.SaveFileDialog; $dialog.Filter='Texto (*.txt)|*.txt|JSON (*.json)|*.json'; $dialog.FileName='gestoros-diagnostico.txt'
      try {
        if ($dialog.ShowDialog() -eq 'OK') {
          $content=if ($dialog.FilterIndex -eq 2) { $script:report | ConvertTo-Json -Depth 8 } else { ConvertTo-ReportText $script:report }
          [IO.File]::WriteAllText($dialog.FileName,$content,(New-Object Text.UTF8Encoding($true)))
        }
      } catch { [void][Windows.Forms.MessageBox]::Show('Não foi possível salvar o relatório no destino escolhido.') }
      finally { $dialog.Dispose() }
    }) }
    'Copiar relatório' { $b.add_Click({ if ($script:report) { try { [Windows.Forms.Clipboard]::SetText((ConvertTo-ReportText $script:report)) } catch { [void][Windows.Forms.MessageBox]::Show('Área de transferência indisponível.') } } }) }
    'Como corrigir' { $b.add_Click({ [void][Windows.Forms.MessageBox]::Show($details.Text,'Orientação — nenhuma correção automática') }) }
    'Fechar' { $b.add_Click({ $form.Close() }) }
  }
}
$form.add_Shown($refresh)
[void]$form.ShowDialog()
$form.Dispose()
