[CmdletBinding(SupportsShouldProcess)]
param([string]$Root = 'C:\ProgramData\GestorOS')
$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Execute este preparo no host de destino em PowerShell elevado.' }
$paths = @('homologation\backend','homologation\frontend','homologation\files','homologation\company-assets','homologation\backups','homologation\config','homologation\logs\backend','homologation\logs\caddy') | ForEach-Object { Join-Path $Root $_ }
foreach ($path in $paths) { if ($PSCmdlet.ShouldProcess($path, 'Criar diretório persistente')) { New-Item -ItemType Directory -Force -Path $path | Out-Null } }
Write-Warning 'Defina ACLs por conta de serviço/Administradores e retenção de backup antes de gravar dados.'
