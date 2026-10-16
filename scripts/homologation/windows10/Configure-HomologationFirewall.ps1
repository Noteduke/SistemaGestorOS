[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)]
  [ValidateNotNullOrEmpty()]
  [string[]]$LanCidr,
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

function Assert-PrivateNetworkCidr([string]$Value) {
  $parts = $Value.Split('/')
  if ($parts.Count -ne 2) { throw "Informe uma rede IPv4 RFC1918 em formato CIDR: $Value" }

  $address = $null
  $prefix = 0
  if (-not [System.Net.IPAddress]::TryParse($parts[0], [ref]$address) -or
      $address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
      -not [int]::TryParse($parts[1], [ref]$prefix) -or $prefix -lt 1 -or $prefix -gt 32) {
    throw "CIDR IPv4 inválido: $Value"
  }

  $octets = $address.GetAddressBytes()
  $private = ($octets[0] -eq 10 -and $prefix -ge 8) -or
    ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31 -and $prefix -ge 12) -or
    ($octets[0] -eq 192 -and $octets[1] -eq 168 -and $prefix -ge 16)
  if (-not $private) { throw "A rede deve estar integralmente em uma faixa privada RFC1918: $Value" }

  $remaining = $prefix
  foreach ($octet in $octets) {
    $networkBits = [Math]::Min(8, [Math]::Max(0, $remaining))
    $hostMask = if ($networkBits -eq 8) { 0 } elseif ($networkBits -eq 0) { 255 } else { (1 -shl (8 - $networkBits)) - 1 }
    if (($octet -band $hostMask) -ne 0) { throw "Use o endereço de rede, sem bits de host: $Value" }
    $remaining -= $networkBits
  }
}

foreach ($cidr in $LanCidr) { Assert-PrivateNetworkCidr $cidr }

if (-not $Apply -and -not $WhatIfPreference) {
  throw 'Nenhuma regra foi criada. Confira a prévia com -WhatIf e informe -Apply para aplicar.'
}
if ($Apply -and -not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'A aplicação da regra requer PowerShell elevado no host de destino.'
}

$displayName = 'Sistema Gestor OS Homologation HTTPS LAN'
if ($Apply -and (Get-NetFirewallRule -DisplayName $displayName -ErrorAction SilentlyContinue)) {
  throw "A regra '$displayName' já existe. Revise-a manualmente; o script não a substitui."
}

if ($PSCmdlet.ShouldProcess("TCP/443 de $($LanCidr -join ', ')", 'Criar regra de entrada de HTTPS da Homologação')) {
  New-NetFirewallRule -DisplayName $displayName -Description 'Permite HTTPS da Homologação 1 somente das sub-redes privadas explicitamente aprovadas.' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -RemoteAddress $LanCidr -Profile Domain,Private -Enabled True | Out-Null
  Write-Output "Regra criada para TCP/443, redes: $($LanCidr -join ', '). Nenhuma outra porta foi aberta."
}
