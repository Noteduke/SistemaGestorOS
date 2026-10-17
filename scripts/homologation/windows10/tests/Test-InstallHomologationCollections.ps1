[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$installerPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'Install-HomologationServices.ps1'
$source = [IO.File]::ReadAllText($installerPath, [Text.Encoding]::UTF8)
$tokens = $null
$parseErrors = $null
$installerAst = [System.Management.Automation.Language.Parser]::ParseFile($installerPath, [ref]$tokens, [ref]$parseErrors)
if (@($parseErrors).Count -gt 0) {
  throw "O instalador não passou pelo parser PowerShell: $($parseErrors[0].Message)"
}

$functionNames = @(
  'Get-NormalizedCaddyfileLines'
  'Test-OrdinalLineSequence'
  'Get-UniqueCaddyLineIndex'
  'Assert-HomologationCaddyfileContent'
  'Read-XmlDocumentSafely'
  'Get-RequiredXmlText'
  'Assert-WinSWTemplate'
  'Get-ExistingInstallerTargets'
)
foreach ($functionName in $functionNames) {
  $functionAst = $installerAst.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq $functionName
  }, $true)
  if ($null -eq $functionAst) { throw "A função necessária ao teste não foi encontrada: $functionName." }
  Invoke-Expression $functionAst.Extent.Text
}

$targetAssignment = $installerAst.Find({
  param($node)
  $node -is [System.Management.Automation.Language.AssignmentStatementAst] -and
    $node.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and
    $node.Left.VariablePath.UserPath -eq 'existingTargets'
}, $true)
if ($null -eq $targetAssignment -or
    $targetAssignment.Right -isnot [System.Management.Automation.Language.CommandExpressionAst] -or
    $targetAssignment.Right.Expression -isnot [System.Management.Automation.Language.ArrayExpressionAst]) {
  throw 'A atribuição de existingTargets precisa manter o resultado como array explícito no Windows PowerShell 5.1.'
}

$whatIfGuardIndex = $source.IndexOf('if ($WhatIfPreference) {', [StringComparison]::Ordinal)
if ($whatIfGuardIndex -lt 0) { throw 'O guard de -WhatIf não foi encontrado.' }
$whatIfReturnIndex = $source.IndexOf('return', $whatIfGuardIndex, [StringComparison]::Ordinal)
if ($whatIfReturnIndex -lt $whatIfGuardIndex) { throw 'O caminho -WhatIf não retorna antes das operações de instalação.' }
foreach ($mutatingCommand in @('Invoke-Icacls -Arguments', 'New-Item -ItemType Directory', 'Copy-Item -LiteralPath', '& $backendWrapper install', '& $caddyWrapper install', '& $backendWrapper start', '& $caddyWrapper start')) {
  $commandIndex = $source.IndexOf($mutatingCommand, $whatIfGuardIndex, [StringComparison]::Ordinal)
  if ($commandIndex -ge 0 -and $commandIndex -lt $whatIfReturnIndex) {
    throw "O caminho -WhatIf alcançaria uma operação mutável antes de retornar: $mutatingCommand"
  }
}

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('GestorOS-Installer-Count-' + [guid]::NewGuid().ToString('N'))
try {
  [void][IO.Directory]::CreateDirectory($testRoot)
  $missingA = Join-Path $testRoot 'missing-a'
  $missingB = Join-Path $testRoot 'missing-b'
  $existingA = Join-Path $testRoot 'existing-a'
  $existingB = Join-Path $testRoot 'existing-b'

  $emptyResult = @(Get-ExistingInstallerTargets -CandidatePaths @($missingA, $missingB))
  if ($emptyResult.Count -ne 0) { throw "Esperava zero destinos existentes; obtidos $($emptyResult.Count)." }

  [IO.File]::WriteAllText($existingA, 'test')
  $singleResult = @(Get-ExistingInstallerTargets -CandidatePaths @($existingA, $missingA))
  if ($singleResult.Count -ne 1 -or $singleResult[0] -cne $existingA) {
    throw 'A coleta de um único destino existente não preservou uma coleção de tamanho um.'
  }

  [IO.File]::WriteAllText($existingB, 'test')
  $multipleResult = @(Get-ExistingInstallerTargets -CandidatePaths @($existingA, $existingB, $missingB))
  if ($multipleResult.Count -ne 2) { throw "Esperava dois destinos existentes; obtidos $($multipleResult.Count)." }

  $scriptRoot = Split-Path -Parent $installerPath
  $caddyTemplatePath = Join-Path $scriptRoot 'Caddyfile.homologation.template'
  $caddyText = [IO.File]::ReadAllText($caddyTemplatePath, [Text.Encoding]::UTF8)
  $expectedFrontendRoot = 'C:/ProgramData/GestorOS/homologation/frontend/dist'
  Assert-HomologationCaddyfileContent -CaddyfileText $caddyText -TemplateText $caddyText -ExpectedFrontendRoot $expectedFrontendRoot

  $caddyLines = @([regex]::Split($caddyText, '\r\n|\n|\r'))
  $proxyIndex = [Array]::IndexOf($caddyLines, '        reverse_proxy @api 127.0.0.1:3100')
  $tryFilesIndex = [Array]::IndexOf($caddyLines, '        try_files {path} /index.html')
  if ($proxyIndex -lt 0 -or $tryFilesIndex -lt 0) { throw 'O template Caddy não contém os handlers aprovados.' }
  $caddyLines[$proxyIndex] = '        try_files {path} /index.html'
  $caddyLines[$tryFilesIndex] = '        reverse_proxy @api 127.0.0.1:3100'
  $unsafeCaddyText = $caddyLines -join "`n"
  $unsafeOrderRejected = $false
  try {
    Assert-HomologationCaddyfileContent -CaddyfileText $unsafeCaddyText -TemplateText $caddyText -ExpectedFrontendRoot $expectedFrontendRoot
  } catch { $unsafeOrderRejected = $true }
  if (-not $unsafeOrderRejected) { throw 'O validador aceitou Caddyfile com proxy depois do fallback de rotas.' }

  $legacyCaddyText = $caddyText.Replace('    route {', '    handle {')
  $legacyConfigRejected = $false
  try {
    Assert-HomologationCaddyfileContent -CaddyfileText $legacyCaddyText -TemplateText $caddyText -ExpectedFrontendRoot $expectedFrontendRoot
  } catch { $legacyConfigRejected = $true }
  if (-not $legacyConfigRejected) { throw 'O validador aceitou uma configuração Caddy sem o bloco route aprovado.' }

  $backendTemplate = Join-Path $scriptRoot 'Backend.xml.template'
  Assert-WinSWTemplate -Path $backendTemplate -ExpectedId 'GestorOSBackendHomologation' -ExpectedName 'Gestor OS Backend Homologation' -ExpectedExecutable 'C:\Program Files\nodejs\node.exe' -ExpectedArguments 'dist\main.js' -ExpectedWorkingDirectory 'C:\ProgramData\GestorOS\homologation\backend' -ExpectedLogPath 'C:\ProgramData\GestorOS\homologation\logs\backend' -ExpectedEnvironmentName 'GOS_ENV_FILE' -ExpectedEnvironmentValue 'C:\ProgramData\GestorOS\homologation\config\.env.homologation'
  $caddyServiceTemplate = Join-Path $scriptRoot 'Caddy.xml.template'
  Assert-WinSWTemplate -Path $caddyServiceTemplate -ExpectedId 'GestorOSCaddyHomologation' -ExpectedName 'Gestor OS Caddy Homologation' -ExpectedExecutable 'C:\Program Files\GestorOS\caddy.exe' -ExpectedArguments 'run --config C:\ProgramData\GestorOS\homologation\config\Caddyfile' -ExpectedWorkingDirectory 'C:\ProgramData\GestorOS\homologation\config' -ExpectedLogPath 'C:\ProgramData\GestorOS\homologation\logs\caddy'

  Write-Output 'PASS: coleta mantém resultado correto para zero, um e vários destinos sob StrictMode.'
  Write-Output 'PASS: AST confirma que existingTargets permanece um array explícito no ponto de uso.'
  Write-Output 'PASS: validação estática confirma que -WhatIf retorna antes das operações mutáveis.'
  Write-Output 'PASS: template Caddy aprovado e rejeição de ordem insegura/configuração sem route.'
  Write-Output 'PASS: templates WinSW mantêm LocalService, XMLs de serviço e destinos de homologação.'
} finally {
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
