[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
foreach ($name in @('NODE_OPTIONS','DEBUG','NODE_DEBUG')) {
  if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name,'Process'))) { throw 'Use um terminal sem instrumentacao Node ou debug herdado; nao exibir valores.' }
}
$node='C:\Program Files\nodejs\node.exe'
$diagnostic=Join-Path $PSScriptRoot 'Check-MySqlRsa.mjs'
if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or -not (Test-Path -LiteralPath $diagnostic -PathType Leaf)) { throw 'Node ou diagnostico ausente.' }
$version=@(& $node --version)
if ($LASTEXITCODE -ne 0 -or ($version -join '') -notmatch '^v24\.') { throw 'Node.js 24 obrigatorio.' }
# Capture native output; never forward raw errors from modules or connection attempts.
$ErrorActionPreference='Continue'
try { $output=@(& $node $diagnostic diagnose 2>&1); $code=$LASTEXITCODE }
finally { $ErrorActionPreference='Stop' }
$text=$output -join "`n"
if ($code -eq 0 -and $text -ceq 'READ_ONLY_OK database=gestor_os_homologation account=gos_homologation_app@127.0.0.1 prisma=7.10.1') {
  Write-Output $text
} else {
  $category='CONFIGURATION_OR_CONNECTION'
  if ($text -match '(?m)^CHECK_FAILED category=(AUTHENTICATION|RSA_AUTHENTICATION|TIMEOUT|CONNECTION|POOL|CONFIGURATION_OR_CONNECTION)$') { $category=$Matches[1] }
  throw ('Diagnostico recusado/falhou; categoria='+$category+'. Nao compartilhar mensagens nativas nem configuracao.')
}
