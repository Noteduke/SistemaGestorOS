[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory = $true)]
  [string]$CaddyExe,

  [Parameter(Mandatory = $true)]
  [string]$WinSWExe,

  [string]$InstallRoot = 'C:\ProgramData\GestorOS\homologation',

  [switch]$Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedInstallRoot = 'C:\ProgramData\GestorOS\homologation'
$expectedProgramRoot = 'C:\Program Files\GestorOS'
$nodeExe = 'C:\Program Files\nodejs\node.exe'
$scriptRoot = $PSScriptRoot
$configRoot = Join-Path $InstallRoot 'config'
$backendRoot = Join-Path $InstallRoot 'backend'
$frontendRoot = Join-Path $InstallRoot 'frontend'
$frontendDist = Join-Path $frontendRoot 'dist'
$filesRoot = Join-Path $InstallRoot 'files'
$companyAssetsRoot = Join-Path $InstallRoot 'company-assets'
$logsRoot = Join-Path $InstallRoot 'logs'
$backendLogs = Join-Path $logsRoot 'backend'
$caddyLogs = Join-Path $logsRoot 'caddy'
$envFile = Join-Path $configRoot '.env.homologation'
$caddyfile = Join-Path $configRoot 'Caddyfile'
$backendWrapper = Join-Path $expectedProgramRoot 'GestorOSBackend.exe'
$caddyWrapper = Join-Path $expectedProgramRoot 'GestorOSCaddy.exe'
$caddyInstalled = Join-Path $expectedProgramRoot 'caddy.exe'
$backendXml = Join-Path $expectedProgramRoot 'GestorOSBackend.xml'
$caddyXml = Join-Path $expectedProgramRoot 'GestorOSCaddy.xml'

function Get-NormalizedCaddyfileLines {
  param([Parameter(Mandatory = $true)][string]$Text)

  $lines = [regex]::Split($Text, '\r\n|\n|\r')
  $normalized = @()
  foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#', [StringComparison]::Ordinal)) { continue }
    $normalized += $trimmed
  }
  return $normalized
}

function Test-OrdinalLineSequence {
  param(
    [Parameter(Mandatory = $true)][string[]]$Expected,
    [Parameter(Mandatory = $true)][string[]]$Actual
  )

  if ($Expected.Count -ne $Actual.Count) { return $false }
  for ($index = 0; $index -lt $Expected.Count; $index++) {
    if (-not [string]::Equals($Expected[$index], $Actual[$index], [StringComparison]::Ordinal)) { return $false }
  }
  return $true
}

function Get-UniqueCaddyLineIndex {
  param(
    [Parameter(Mandatory = $true)][string[]]$Lines,
    [Parameter(Mandatory = $true)][string]$ExpectedLine
  )

  $foundIndex = -1
  for ($index = 0; $index -lt $Lines.Count; $index++) {
    if (-not [string]::Equals($Lines[$index], $ExpectedLine, [StringComparison]::Ordinal)) { continue }
    if ($foundIndex -ge 0) { throw 'O template oficial do Caddyfile contém diretiva estrutural duplicada; conteúdo omitido.' }
    $foundIndex = $index
  }
  if ($foundIndex -lt 0) { throw 'O template oficial do Caddyfile não contém a estrutura obrigatória; conteúdo omitido.' }
  return $foundIndex
}

function Assert-HomologationCaddyfileContent {
  param(
    [Parameter(Mandatory = $true)][string]$CaddyfileText,
    [Parameter(Mandatory = $true)][string]$TemplateText,
    [Parameter(Mandatory = $true)][string]$ExpectedFrontendRoot
  )

  $templateLines = @(Get-NormalizedCaddyfileLines -Text $TemplateText)
  $actualLines = @(Get-NormalizedCaddyfileLines -Text $CaddyfileText)
  $orderedDirectives = @(
    'gestor-os.home.arpa {'
    'bind 0.0.0.0'
    'tls internal'
    'encode zstd gzip'
    "root * $ExpectedFrontendRoot"
    'route {'
    '@outsideLan not remote_ip private_ranges'
    '@api path /api/v1/*'
    'reverse_proxy @api 127.0.0.1:3100'
    'try_files {path} /index.html'
    'file_server'
  )

  $directiveIndices = @()
  foreach ($directive in $orderedDirectives) {
    $directiveIndices += Get-UniqueCaddyLineIndex -Lines $templateLines -ExpectedLine $directive
  }
  $denyPrefix = 'respond @outsideLan "'
  $denySuffix = '" 403'
  $denyIndices = @()
  for ($index = 0; $index -lt $templateLines.Count; $index++) {
    if ($templateLines[$index].StartsWith($denyPrefix, [StringComparison]::Ordinal) -and
        $templateLines[$index].EndsWith($denySuffix, [StringComparison]::Ordinal)) {
      $denyIndices += $index
    }
  }
  if ($denyIndices.Count -ne 1) { throw 'O template oficial do Caddyfile não possui uma única resposta 403 para o bloqueio de rede; conteúdo omitido.' }

  $orderedIndices = @($directiveIndices[0..6]) + @($denyIndices[0]) + @($directiveIndices[7..($directiveIndices.Count - 1)])
  for ($index = 1; $index -lt $orderedIndices.Count; $index++) {
    if ($orderedIndices[$index] -le $orderedIndices[$index - 1]) {
      throw 'O template oficial do Caddyfile não preserva a ordem segura dos handlers; conteúdo omitido.'
    }
  }

  $openingBraces = @()
  $closingBraces = @()
  for ($index = 0; $index -lt $templateLines.Count; $index++) {
    if ($templateLines[$index].EndsWith('{', [StringComparison]::Ordinal)) { $openingBraces += $index }
    if ([string]::Equals($templateLines[$index], '}', [StringComparison]::Ordinal)) { $closingBraces += $index }
  }
  if ($openingBraces.Count -ne 2 -or $openingBraces[0] -ne $directiveIndices[0] -or $openingBraces[1] -ne $directiveIndices[5] -or
      $closingBraces.Count -ne 2 -or $closingBraces[0] -ne ($templateLines.Count - 2) -or $closingBraces[1] -ne ($templateLines.Count - 1)) {
    throw 'O template oficial do Caddyfile não possui blocos de site e route balanceados; conteúdo omitido.'
  }
  if (-not (Test-OrdinalLineSequence -Expected $templateLines -Actual $actualLines)) {
    throw 'Caddyfile incompatível com o template oficial ou com a ordem segura dos handlers; conteúdo omitido.'
  }
}

function Assert-RequiredFile {
  param([string]$Path, [string]$Description)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Pré-requisito ausente: $Description."
  }
}

function Assert-RequiredDirectory {
  param([string]$Path, [string]$Description)
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    throw "Pré-requisito ausente: $Description. Execute a preparação e o deploy dos artefatos antes."
  }
}

function Read-EnvironmentFileSafely {
  param([string]$Path)

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*(?:#|$)') { continue }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
      throw 'O arquivo de ambiente contém uma linha inválida; conteúdo omitido.'
    }

    $key = $Matches[1]
    $value = $Matches[2]
    if ($values.ContainsKey($key)) {
      throw "O arquivo de ambiente contém uma variável duplicada: $key."
    }
    if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[$value.Length - 1] -eq '"') -or ($value[0] -eq "'" -and $value[$value.Length - 1] -eq "'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$key] = $value
  }
  return $values
}

function Assert-HomologationEnvironment {
  param([string]$Path)

  $environment = Read-EnvironmentFileSafely -Path $Path
  $requiredValues = @{
    GOS_DEPLOYMENT_ENV = 'homologation'
    GOS_DATABASE_TARGET = 'gestor_os_homologation'
    GOS_EXTERNAL_EFFECTS_ENABLED = 'false'
    GOS_HOMOLOGATION_FILES_DIR = (Join-Path $InstallRoot 'files')
    GOS_COMPANY_ASSETS_DIR = (Join-Path $InstallRoot 'company-assets')
    PORT = '3100'
    AUTH_SESSION_COOKIE_NAME = 'gos_homologation_session'
    AUTH_PREAUTH_COOKIE_NAME = 'gos_homologation_pre_auth'
    AUTH_COOKIE_SECURE = 'true'
    AUTH_COOKIE_SAME_SITE = 'lax'
  }

  foreach ($key in $requiredValues.Keys) {
    if (-not $environment.ContainsKey($key)) {
      throw "Configuração obrigatória ausente no arquivo de ambiente: $key."
    }
    if ($key -in @('GOS_HOMOLOGATION_FILES_DIR', 'GOS_COMPANY_ASSETS_DIR')) {
      $actualPath = [IO.Path]::GetFullPath($environment[$key])
      $expectedPath = [IO.Path]::GetFullPath($requiredValues[$key])
      if (-not [string]::Equals($actualPath, $expectedPath, [StringComparison]::OrdinalIgnoreCase)) {
        throw "O caminho configurado para $key não corresponde ao diretório persistente da homologação."
      }
    } elseif ($environment[$key] -cne $requiredValues[$key]) {
      throw "Configuração incompatível no arquivo de ambiente: $key."
    }
  }

  $databaseUrlKeys = @($environment.Keys | Where-Object { $_ -match 'DATABASE_URL' })
  if ($databaseUrlKeys.Count -ne 1 -or $databaseUrlKeys[0] -cne 'DATABASE_URL') {
    throw 'O arquivo de ambiente deve conter somente DATABASE_URL como configuração de conexão do Backend.'
  }
  if (-not $environment.ContainsKey('DATABASE_URL')) {
    throw 'DATABASE_URL ausente no arquivo de ambiente; conteúdo omitido.'
  }

  try {
    $databaseUri = [Uri]$environment['DATABASE_URL']
    $userInfo = $databaseUri.UserInfo
    $separatorIndex = $userInfo.IndexOf(':')
    $databaseUser = if ($separatorIndex -ge 0) { [Uri]::UnescapeDataString($userInfo.Substring(0, $separatorIndex)) } else { [Uri]::UnescapeDataString($userInfo) }
    $databasePassword = if ($separatorIndex -ge 0) { [Uri]::UnescapeDataString($userInfo.Substring($separatorIndex + 1)) } else { '' }
    $databaseName = [Uri]::UnescapeDataString($databaseUri.AbsolutePath.TrimStart('/'))
  } catch {
    throw 'DATABASE_URL inválida; detalhes e credenciais foram omitidos.'
  }

  if ($databaseUri.Scheme -cne 'mysql' -or -not $databaseUri.IsLoopback -or $databaseUri.Port -ne 3306 -or
      $databaseUser -cne 'gos_homologation_app' -or $databaseName -cne 'gestor_os_homologation' -or
      [string]::IsNullOrWhiteSpace($databasePassword) -or $databasePassword -match '^(?i:COLOQUE|CHANGE[_-]?ME|REPLACE)') {
    throw 'DATABASE_URL deve usar somente gos_homologation_app em gestor_os_homologation, no MySQL local; credenciais foram omitidas.'
  }

  return $environment
}

function Read-XmlDocumentSafely {
  param([string]$Path)

  $settings = New-Object System.Xml.XmlReaderSettings
  $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
  $settings.XmlResolver = $null
  $reader = [System.Xml.XmlReader]::Create($Path, $settings)
  try {
    $document = New-Object System.Xml.XmlDocument
    $document.XmlResolver = $null
    $document.Load($reader)
    return $document
  } finally {
    $reader.Dispose()
  }
}

function Get-RequiredXmlText {
  param([System.Xml.XmlDocument]$Document, [string]$XPath, [string]$Description)
  $node = $Document.SelectSingleNode($XPath)
  if (-not $node -or [string]::IsNullOrWhiteSpace($node.InnerText)) {
    throw "Template WinSW inválido: elemento obrigatório ausente ($Description)."
  }
  return $node.InnerText.Trim()
}

function Assert-WinSWTemplate {
  param(
    [string]$Path,
    [string]$ExpectedId,
    [string]$ExpectedName,
    [string]$ExpectedExecutable,
    [string]$ExpectedArguments,
    [string]$ExpectedWorkingDirectory,
    [string]$ExpectedLogPath,
    [string]$ExpectedEnvironmentName = '',
    [string]$ExpectedEnvironmentValue = ''
  )

  $rawXml = Get-Content -LiteralPath $Path -Raw
  if ($rawXml -match '(?i)<\s*password\b|\bpassword\s*=|DATABASE_URL|mysql://|mariadb://') {
    throw "Template WinSW contém credenciais ou configuração de banco e foi recusado: $(Split-Path -Leaf $Path)."
  }
  $document = Read-XmlDocumentSafely -Path $Path
  if ($document.DocumentElement.LocalName -cne 'service') { throw "Raiz XML WinSW inválida: $(Split-Path -Leaf $Path)." }

  $allowedElements = @('id', 'name', 'startmode', 'description', 'executable', 'arguments', 'workingdirectory', 'env', 'serviceaccount', 'logpath', 'log', 'onfailure')
  foreach ($child in $document.DocumentElement.ChildNodes) {
    if ($child.NodeType -eq [System.Xml.XmlNodeType]::Element -and $child.LocalName -notin $allowedElements) {
      throw "Template WinSW contém elemento não reconhecido: $(Split-Path -Leaf $Path)."
    }
  }

  $checks = @(
    [pscustomobject]@{ XPath = '/service/id'; Value = $ExpectedId; Description = 'id' }
    [pscustomobject]@{ XPath = '/service/name'; Value = $ExpectedName; Description = 'name' }
    [pscustomobject]@{ XPath = '/service/startmode'; Value = 'Automatic'; Description = 'startmode' }
    [pscustomobject]@{ XPath = '/service/executable'; Value = $ExpectedExecutable; Description = 'executable' }
    [pscustomobject]@{ XPath = '/service/arguments'; Value = $ExpectedArguments; Description = 'arguments' }
    [pscustomobject]@{ XPath = '/service/workingdirectory'; Value = $ExpectedWorkingDirectory; Description = 'workingdirectory' }
    [pscustomobject]@{ XPath = '/service/serviceaccount/username'; Value = 'NT AUTHORITY\LocalService'; Description = 'serviceaccount/username' }
    [pscustomobject]@{ XPath = '/service/logpath'; Value = $ExpectedLogPath; Description = 'logpath' }
  )
  foreach ($check in $checks) {
    if ($document.SelectNodes($check.XPath).Count -ne 1) {
      throw "Template WinSW deve conter exatamente um elemento $($check.Description): $(Split-Path -Leaf $Path)."
    }
    $actual = Get-RequiredXmlText -Document $document -XPath $check.XPath -Description $check.Description
    if (-not [string]::Equals($actual, $check.Value, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Template WinSW incompatível em $($check.Description): $(Split-Path -Leaf $Path)."
    }
  }

  $logNode = $document.SelectSingleNode('/service/log')
  $failureNode = $document.SelectSingleNode('/service/onfailure')
  $accountNode = $document.SelectSingleNode('/service/serviceaccount')
  if ($document.SelectNodes('/service/log').Count -ne 1 -or $logNode.GetAttribute('mode') -cne 'roll' -or
      $document.SelectNodes('/service/onfailure').Count -ne 1 -or $failureNode.GetAttribute('action') -cne 'restart' -or
      $failureNode.GetAttribute('delay') -cne '10 sec' -or $document.SelectNodes('/service/serviceaccount').Count -ne 1 -or
      @($accountNode.ChildNodes | Where-Object NodeType -eq ([System.Xml.XmlNodeType]::Element) | Where-Object LocalName -ne 'username').Count -gt 0) {
    throw "Template WinSW não possui a política aprovada de logs e reinício: $(Split-Path -Leaf $Path)."
  }

  if ($ExpectedEnvironmentName) {
    if ($document.SelectNodes('/service/env').Count -ne 1) { throw "Template WinSW deve conter somente uma variável de ambiente: $(Split-Path -Leaf $Path)." }
    $envNode = $document.SelectSingleNode("/service/env[@name='$ExpectedEnvironmentName']")
    if (-not $envNode -or -not [string]::Equals($envNode.GetAttribute('value'), $ExpectedEnvironmentValue, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Template WinSW não aponta para o arquivo de ambiente esperado: $(Split-Path -Leaf $Path)."
    }
  } elseif ($document.SelectNodes('/service/env').Count -ne 0) {
    throw "Template WinSW contém variável de ambiente não prevista: $(Split-Path -Leaf $Path)."
  }
}

function Assert-LocalServicePermission {
  param([string]$Path, [System.Security.AccessControl.FileSystemRights]$RequiredRights)

  $acl = Get-Acl -LiteralPath $Path
  $localServiceRuleFound = $false
  foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { continue }
    if ($rule.IdentityReference.Value -eq 'S-1-5-19' -and (($rule.FileSystemRights -band $RequiredRights) -eq $RequiredRights)) {
      $localServiceRuleFound = $true
      break
    }
  }
  if (-not $localServiceRuleFound) {
    throw "ACL não concede ao LocalService as permissões necessárias em: $Path."
  }
}

function Invoke-Icacls {
  param([string[]]$Arguments, [string]$FailureMessage)
  & $script:icaclsExe @Arguments 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
}

if (-not [string]::Equals([IO.Path]::GetFullPath($InstallRoot), [IO.Path]::GetFullPath($expectedInstallRoot), [StringComparison]::OrdinalIgnoreCase)) {
  throw 'InstallRoot deve permanecer no caminho homologation aprovado; os templates usam caminhos absolutos fixos.'
}
if (-not [string]::Equals([IO.Path]::GetFullPath((Join-Path $env:ProgramFiles 'GestorOS')), [IO.Path]::GetFullPath($expectedProgramRoot), [StringComparison]::OrdinalIgnoreCase)) {
  throw 'O diretório Program Files não corresponde aos caminhos absolutos definidos nos templates WinSW.'
}
if (-not $Apply -and -not $WhatIfPreference) {
  throw 'Nenhuma alteração executada. Use -WhatIf para a prévia ou -Apply após revisar os pré-requisitos.'
}

$caddySource = [IO.Path]::GetFullPath($CaddyExe)
$winSwSource = [IO.Path]::GetFullPath($WinSWExe)
Assert-RequiredFile -Path $caddySource -Description 'executável Caddy previamente obtido e verificado'
Assert-RequiredFile -Path $winSwSource -Description 'executável WinSW previamente obtido e verificado'
Assert-RequiredFile -Path $nodeExe -Description 'Node.js 24 no caminho fixo de instalação'
Assert-RequiredFile -Path (Join-Path $scriptRoot 'Backend.xml.template') -Description 'template XML do Backend'
Assert-RequiredFile -Path (Join-Path $scriptRoot 'Caddy.xml.template') -Description 'template XML do Caddy'
Assert-RequiredFile -Path (Join-Path $scriptRoot 'Caddyfile.homologation.template') -Description 'template oficial do Caddyfile'
Assert-RequiredFile -Path (Join-Path $scriptRoot '../../../tools/gestoros-diagnostico/Homologation.Rules.psd1') -Description 'regras locais de homologação'
Assert-RequiredFile -Path (Join-Path $configRoot '.env.homologation') -Description 'arquivo local de ambiente homologation'
Assert-RequiredFile -Path $caddyfile -Description 'Caddyfile de homologação'
Assert-RequiredFile -Path (Join-Path $backendRoot 'dist/main.js') -Description 'entrypoint compilado do Backend'
Assert-RequiredFile -Path (Join-Path $backendRoot 'dist/generated/prisma/client.js') -Description 'Prisma Client gerado no Backend implantado'
Assert-RequiredFile -Path (Join-Path $backendRoot 'package.json') -Description 'package.json do Backend implantado'
Assert-RequiredFile -Path (Join-Path $backendRoot 'node_modules/@prisma/adapter-mariadb/package.json') -Description 'adapter MariaDB do Backend implantado'
Assert-RequiredFile -Path (Join-Path $frontendDist 'index.html') -Description 'Frontend homologation implantado'
Assert-RequiredFile -Path (Join-Path $frontendRoot 'build-info.json') -Description 'manifesto do build Frontend'
foreach ($directory in @($InstallRoot, $configRoot, $backendRoot, $frontendRoot, $frontendDist, $filesRoot, $companyAssetsRoot, $backendLogs, $caddyLogs)) {
  Assert-RequiredDirectory -Path $directory -Description "diretório persistente $directory"
}

$environment = Assert-HomologationEnvironment -Path $envFile
$machineDatabaseUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'Machine')
if ($null -ne $machineDatabaseUrl) {
  throw 'Existe uma DATABASE_URL global no Windows que pode substituir a configuração local do serviço; revise-a sem expor o valor.'
}
foreach ($key in @('GOS_DEPLOYMENT_ENV', 'GOS_DATABASE_TARGET', 'GOS_EXTERNAL_EFFECTS_ENABLED', 'GOS_HOMOLOGATION_FILES_DIR', 'GOS_COMPANY_ASSETS_DIR', 'PORT', 'AUTH_SESSION_COOKIE_NAME', 'AUTH_PREAUTH_COOKIE_NAME', 'AUTH_COOKIE_SECURE', 'AUTH_COOKIE_SAME_SITE')) {
  $machineValue = [Environment]::GetEnvironmentVariable($key, 'Machine')
  if ($null -ne $machineValue -and $machineValue -cne $environment[$key]) {
    throw "Variável global do Windows conflita com a configuração homologation: $key."
  }
}

$expectedFrontendRoot = ($frontendDist -replace '\\', '/')
$caddyfileText = [IO.File]::ReadAllText($caddyfile, [Text.Encoding]::UTF8)
$caddyTemplateText = [IO.File]::ReadAllText((Join-Path $scriptRoot 'Caddyfile.homologation.template'), [Text.Encoding]::UTF8)
Assert-HomologationCaddyfileContent -CaddyfileText $caddyfileText -TemplateText $caddyTemplateText -ExpectedFrontendRoot $expectedFrontendRoot

$rules = Import-PowerShellDataFile (Join-Path $scriptRoot '../../../tools/gestoros-diagnostico/Homologation.Rules.psd1')
$backendPackage = Get-Content -LiteralPath (Join-Path $backendRoot 'package.json') -Raw | ConvertFrom-Json
foreach ($dependency in $backendPackage.dependencies.PSObject.Properties.Name) {
  $dependencyManifest = Join-Path $backendRoot (Join-Path 'node_modules' (Join-Path ($dependency -replace '/', '\') 'package.json'))
  if (-not (Test-Path -LiteralPath $dependencyManifest -PathType Leaf)) {
    throw "Dependência de produção do Backend ausente no deploy: $dependency."
  }
}
$backendTemplate = Join-Path $scriptRoot 'Backend.xml.template'
$caddyTemplate = Join-Path $scriptRoot 'Caddy.xml.template'
Assert-WinSWTemplate -Path $backendTemplate -ExpectedId 'GestorOSBackendHomologation' -ExpectedName 'Gestor OS Backend Homologation' -ExpectedExecutable $nodeExe -ExpectedArguments 'dist\main.js' -ExpectedWorkingDirectory $backendRoot -ExpectedLogPath $backendLogs -ExpectedEnvironmentName 'GOS_ENV_FILE' -ExpectedEnvironmentValue $envFile
Assert-WinSWTemplate -Path $caddyTemplate -ExpectedId 'GestorOSCaddyHomologation' -ExpectedName 'Gestor OS Caddy Homologation' -ExpectedExecutable $caddyInstalled -ExpectedArguments "run --config $caddyfile" -ExpectedWorkingDirectory $configRoot -ExpectedLogPath $caddyLogs

$manifest = Get-Content -LiteralPath (Join-Path $frontendRoot 'build-info.json') -Raw | ConvertFrom-Json
if ($manifest.environment -cne 'homologation' -or -not $manifest.homologationMarkerVerified -or -not $manifest.sourceCommit -or -not $manifest.frontendVersion) {
  throw 'Manifesto do Frontend não confirma um build homologation identificado.'
}
$markerFound = $false
foreach ($bundle in Get-ChildItem -LiteralPath $frontendDist -Recurse -File | Where-Object Extension -in @('.js', '.css')) {
  if (Select-String -LiteralPath $bundle.FullName -SimpleMatch -Pattern $rules.Marker -Quiet) { $markerFound = $true; break }
}
if (-not $markerFound) { throw 'O bundle Frontend não contém a marca obrigatória de homologação.' }

$icaclsCommand = Get-Command icacls.exe -ErrorAction SilentlyContinue
if (-not $icaclsCommand) { throw 'icacls.exe não está disponível para aplicar as ACLs planejadas.' }
$script:icaclsExe = $icaclsCommand.Source
$serviceNames = @('GestorOSBackendHomologation', 'GestorOSCaddyHomologation')
$existingServices = @(Get-Service -Name $serviceNames -ErrorAction SilentlyContinue)
if ($existingServices.Count -gt 0) { throw 'Já existe ao menos um serviço com o nome reservado; revise manualmente antes de instalar ou substituir arquivos.' }
$existingTargets = @($caddyInstalled, $backendWrapper, $caddyWrapper, $backendXml, $caddyXml, "$backendWrapper.config", "$caddyWrapper.config") | Where-Object { Test-Path -LiteralPath $_ }
if ($existingTargets.Count -gt 0) {
  throw 'Há artefatos de uma instalação anterior, incluindo possíveis configurações legadas .exe.config; revise manualmente. Nenhum arquivo será sobrescrito ou removido.'
}

$nodeVersionOutput = (& $nodeExe --version 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersionOutput -notmatch '^v24\.') { throw 'O Node.js no caminho configurado não é uma versão 24 válida.' }

if ($WhatIfPreference) {
  Write-Output 'Prévia concluída: caminhos, ambiente (valores secretos omitidos), conta de serviço, XMLs, manifesto, bundle e destinos de ACL foram verificados.'
  Write-Output "Node.js $nodeVersionOutput confirmado. Nenhuma alteração foi feita; a adaptação sintática do Caddyfile será executada no fluxo real antes da primeira alteração."
  Write-Output 'Nenhum arquivo foi copiado, nenhuma ACL foi alterada e nenhum serviço ou configuração do servidor foi modificado.'
  Write-Output 'A instalação real requer execução elevada e -Apply explícito.'
  return
}

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'A instalação requer PowerShell elevado no host de destino.'
}

$caddyVersionOutput = (& $caddySource version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($caddyVersionOutput)) { throw 'Não foi possível validar a versão do executável Caddy fornecido.' }
$caddyAdaptationOutput = (& $caddySource adapt --config $caddyfile --adapter caddyfile 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($caddyAdaptationOutput)) { throw 'Caddy não conseguiu adaptar o Caddyfile; nenhuma ACL, cópia ou serviço foi alterado.' }

if (-not $PSCmdlet.ShouldProcess($configRoot, 'Restringir configuração e credenciais para Administrators, SYSTEM e LocalService')) {
  throw 'Aplicação de ACL recusada; instalação interrompida antes da cópia ou registro dos serviços.'
}
Invoke-Icacls -Arguments @($configRoot, '/inheritance:r', '/grant:r', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '*S-1-5-19:(OI)(CI)RX', '/T') -FailureMessage 'Falha ao restringir ACL da configuração local.'

if (-not $PSCmdlet.ShouldProcess($InstallRoot, 'Conceder ao LocalService leitura dos artefatos e gravação apenas em arquivos, logos e logs')) {
  throw 'Aplicação de ACL recusada; instalação interrompida antes da cópia ou registro dos serviços.'
}
foreach ($path in @($InstallRoot, $frontendRoot, $backendRoot, $configRoot)) {
  Invoke-Icacls -Arguments @($path, '/grant', '*S-1-5-19:(OI)(CI)RX', '/T') -FailureMessage "Falha ao conceder leitura ao LocalService em $path."
}
foreach ($path in @($filesRoot, $companyAssetsRoot, $logsRoot)) {
  Invoke-Icacls -Arguments @($path, '/grant', '*S-1-5-19:(OI)(CI)M', '/T') -FailureMessage "Falha ao conceder gravação ao LocalService em $path."
}
foreach ($path in @($configRoot, $backendRoot, $frontendRoot)) {
  Assert-LocalServicePermission -Path $path -RequiredRights ([System.Security.AccessControl.FileSystemRights]::ReadAndExecute)
}
foreach ($path in @($filesRoot, $companyAssetsRoot, $logsRoot)) {
  Assert-LocalServicePermission -Path $path -RequiredRights ([System.Security.AccessControl.FileSystemRights]::Modify)
}

if (-not $PSCmdlet.ShouldProcess($expectedProgramRoot, 'Copiar Caddy, WinSW e configurações com nomes de arquivo esperados pelo WinSW')) {
  throw 'Cópia de artefatos recusada; nenhum serviço será instalado.'
}
New-Item -ItemType Directory -Force -Path $expectedProgramRoot | Out-Null
Copy-Item -LiteralPath $caddySource -Destination $caddyInstalled
Copy-Item -LiteralPath $winSwSource -Destination $backendWrapper
Copy-Item -LiteralPath $winSwSource -Destination $caddyWrapper
Copy-Item -LiteralPath $backendTemplate -Destination $backendXml
Copy-Item -LiteralPath $caddyTemplate -Destination $caddyXml
foreach ($pair in @(@($backendTemplate, $backendXml), @($caddyTemplate, $caddyXml))) {
  if ((Get-FileHash -LiteralPath $pair[0] -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $pair[1] -Algorithm SHA256).Hash) {
    throw 'A cópia de um template WinSW não corresponde ao arquivo validado; instalação interrompida.'
  }
}

if (-not $PSCmdlet.ShouldProcess('GestorOSBackendHomologation e GestorOSCaddyHomologation', 'Registrar ambos os serviços WinSW usando os XMLs correspondentes')) {
  throw 'Registro dos serviços recusado; instalação interrompida antes de iniciá-los.'
}
& $backendWrapper install
if ($LASTEXITCODE -ne 0) { throw 'Falha ao registrar o serviço Backend; verifique manualmente se houve registro parcial.' }
& $caddyWrapper install
if ($LASTEXITCODE -ne 0) { throw 'Falha ao registrar o serviço Caddy; verifique manualmente se houve registro parcial.' }

if (-not $PSCmdlet.ShouldProcess('GestorOSBackendHomologation e GestorOSCaddyHomologation', 'Iniciar ambos os serviços Windows')) {
  throw 'Inicialização dos serviços recusada; ambos permanecem registrados, mas não foram iniciados por este script.'
}
& $backendWrapper start
if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar o serviço Backend.' }
& $caddyWrapper start
if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar o serviço Caddy; confirme o estado do Backend e do Caddy manualmente.' }

Write-Warning 'Confirme ACLs, Firewall de entrada LAN, DNS/hosts e confiança da CA interna nos clientes.'
Write-Output "Validação concluída: Node.js $nodeVersionOutput; executável Caddy e Caddyfile aceitos; dois XMLs WinSW preparados como GestorOSBackend.xml e GestorOSCaddy.xml."
