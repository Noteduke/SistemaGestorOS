[CmdletBinding(SupportsShouldProcess)]
param([string]$CaddyExe, [string]$WinSWExe, [string]$InstallRoot = 'C:\ProgramData\GestorOS\homologation', [switch]$Apply)
$ErrorActionPreference = 'Stop'
if (-not $Apply) { throw 'Instalação de serviços não executada. Revise o host e informe -Apply explicitamente.' }
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'A instalação requer PowerShell elevado no host de destino.' }
foreach ($file in @($CaddyExe,$WinSWExe)) { if (-not $file -or -not (Test-Path -LiteralPath $file)) { throw 'Informe executáveis Caddy e WinSW já obtidos de fontes oficiais.' } }
$programRoot = Join-Path $env:ProgramFiles 'GestorOS'
New-Item -ItemType Directory -Force -Path $programRoot | Out-Null
Copy-Item -LiteralPath $CaddyExe -Destination (Join-Path $programRoot 'caddy.exe') -Force
$configRoot = Join-Path $InstallRoot 'config'
if (-not (Test-Path (Join-Path $configRoot '.env.homologation'))) { throw 'Prepare primeiro o .env.homologation protegido; instalação interrompida.' }
if (-not (Test-Path (Join-Path $configRoot 'Caddyfile'))) { throw 'Prepare primeiro o Caddyfile e confira hostname, diretórios e ACLs.' }
foreach ($directory in @((Join-Path $InstallRoot 'backend'), (Join-Path $InstallRoot 'frontend\dist'), (Join-Path $InstallRoot 'files'), (Join-Path $InstallRoot 'company-assets'), (Join-Path $InstallRoot 'logs\backend'), (Join-Path $InstallRoot 'logs\caddy'))) {
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) { throw "Diretório persistente obrigatório ausente: $directory. Execute o preparo e staging antes." }
}
$caddyValidation = Join-Path $programRoot 'caddy.exe'
& $caddyValidation validate --config (Join-Path $configRoot 'Caddyfile')
if ($LASTEXITCODE -ne 0) { throw 'Validação do Caddyfile falhou.' }
& icacls $configRoot /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-19:(OI)(CI)RX' /T | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Falha ao restringir ACL da configuração/segredo.' }
foreach ($path in @($InstallRoot, (Join-Path $InstallRoot 'frontend'), (Join-Path $InstallRoot 'backend'), $configRoot)) {
  & icacls $path /grant 'NT AUTHORITY\LOCAL SERVICE:(OI)(CI)RX' /T | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Falha ao conceder leitura ao serviço em $path" }
}
foreach ($path in @((Join-Path $InstallRoot 'files'), (Join-Path $InstallRoot 'company-assets'), (Join-Path $InstallRoot 'logs'))) {
  if (Test-Path $path) {
    & icacls $path /grant 'NT AUTHORITY\LOCAL SERVICE:(OI)(CI)M' /T | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao conceder gravação ao serviço em $path" }
  }
}
$backendWrapper = Join-Path $programRoot 'GestorOSBackend.exe'
$caddyWrapper = Join-Path $programRoot 'GestorOSCaddy.exe'
Copy-Item -LiteralPath $WinSWExe -Destination $backendWrapper -Force
Copy-Item -LiteralPath $WinSWExe -Destination $caddyWrapper -Force
$scriptRoot = $PSScriptRoot
Copy-Item (Join-Path $scriptRoot 'Backend.xml.template') "$backendWrapper.config" -Force
Copy-Item (Join-Path $scriptRoot 'Caddy.xml.template') "$caddyWrapper.config" -Force
if ($PSCmdlet.ShouldProcess('Serviços GestorOSBackendHomologation e GestorOSCaddyHomologation', 'Registrar e iniciar serviços Windows')) {
  & $backendWrapper install
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao registrar serviço Backend.' }
  & $caddyWrapper install
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao registrar serviço Caddy.' }
  & $backendWrapper start
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar serviço Backend.' }
  & $caddyWrapper start
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar serviço Caddy.' }
}
Write-Warning 'Confirme ACLs, firewall de entrada LAN, DNS/hosts e confiança da CA interna nos clientes.'
