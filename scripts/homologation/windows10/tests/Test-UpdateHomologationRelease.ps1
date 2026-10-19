[CmdletBinding()]
param(
  [string]$PreparedPackagePath,
  [string]$ExpectedPackageSha256 = 'e141f2ffe8af84f3c1cb3f46540af9e06a083c1b887a650485ee0425d52db7e6',
  [string]$ExpectedSourceCommit = '1f98609e778757aaa5c4488e4d8787040396d62c'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:TestCommit = '1111111111111111111111111111111111111111'
$script:TestRoot = Join-Path ([IO.Path]::GetTempPath()) ('GestorOS-UpdateTests-' + [guid]::NewGuid().ToString('N'))
$sourcePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'Update-HomologationRelease.ps1'
$source = [IO.File]::ReadAllText($sourcePath, [Text.Encoding]::UTF8)
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$parseErrors)
if (@($parseErrors).Count -gt 0) { throw "PowerShell 5.1 parser rejected updater: $($parseErrors[0].Message)" }

$requiredFunctions = @(
  'Get-StreamSha256', 'Get-ZipEntryText', 'Assert-SafeZipEntryPath', 'Get-ValidatedPackageInfo',
  'Get-ArtifactMapping', 'Set-StageDirectoryAcl', 'Expand-ValidatedUpdatePackage',
  'Assert-HomologationEnvironmentFile', 'New-ExclusiveUpdateDirectory', 'Open-ExclusiveUpdateLock', 'Move-UpdateArtifact', 'Write-UpdateJournal',
  'Invoke-ArtifactSwapTransaction', 'Test-SemVerRequirement', 'Assert-InstalledReleaseArtifacts',
  'Get-DependencySignature', 'Read-PackageLockJson', 'Assert-LockMatchesPackage', 'Assert-DependencyUpdateContract', 'New-ReleaseArtifactItems', 'Invoke-OfflineRuntimeValidation'
)
foreach ($functionName in $requiredFunctions) {
  $functionAst = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $functionName
  }, $true)
  if ($null -eq $functionAst) { throw "Updater function missing: $functionName" }
  Invoke-Expression $functionAst.Extent.Text
}

function Assert-Test {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Assert-Throws {
  param([scriptblock]$Action, [string]$ExpectedPattern)
  try {
    & $Action
  } catch {
    if ($_.Exception.Message -like $ExpectedPattern) { return }
    throw "Unexpected failure; expected '$ExpectedPattern', received '$($_.Exception.Message)'"
  }
  throw "Expected failure was not raised: $ExpectedPattern"
}

function New-TestZip {
  param(
    [string]$Name,
    [switch]$BadEnvironment,
    [switch]$OmitBootstrap,
    [switch]$WrongInternalHash,
    [switch]$AddTraversal,
    [switch]$CompleteRuntime,
    [switch]$IncompleteRuntime,
    [switch]$BadLock
  )
  $root = Join-Path $script:TestRoot $Name
  $contentRoot = Join-Path $root 'content'
  $zipPath = Join-Path $root 'package.zip'
  [void][IO.Directory]::CreateDirectory((Join-Path $contentRoot 'backend\dist\scripts'))
  [void][IO.Directory]::CreateDirectory((Join-Path $contentRoot 'backend\dist\infrastructure'))
  [void][IO.Directory]::CreateDirectory((Join-Path $contentRoot 'frontend\dist\assets'))

  $backendPackage = [ordered]@{
    name = 'sistema-gestor-os-backend'
    version = '0.1.0'
    dependencies = [ordered]@{}
  }
  $manifest = [ordered]@{
    application = 'Sistema Gestor OS'
    environment = if ($BadEnvironment) { 'production' } else { 'homologation' }
    releaseType = 'artifact-update'
    sourceCommit = $script:TestCommit
    backendVersion = '0.1.0'
    frontendVersion = '0.1.0'
    nodeVersion = 'v24.21.0'
    runtimeDependenciesIncluded = $false
    runtimeDependenciesUnchanged = $true
    payload = @('backend/package.json', 'backend/dist/**', 'frontend/dist/**', 'frontend/build-info.json')
  }
  $buildInfo = [ordered]@{
    environment = 'homologation'
    frontendVersion = '0.1.0'
    sourceCommit = $script:TestCommit
    homologationMarkerVerified = $true
  }
  [IO.File]::WriteAllText((Join-Path $contentRoot 'backend\package.json'), (ConvertTo-Json $backendPackage -Depth 6), (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText((Join-Path $contentRoot 'release-manifest.json'), (ConvertTo-Json $manifest -Depth 8), (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText((Join-Path $contentRoot 'frontend\build-info.json'), (ConvertTo-Json $buildInfo -Depth 6), (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText((Join-Path $contentRoot 'backend\dist\main.js'), 'backend bundle', (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText((Join-Path $contentRoot 'backend\dist\infrastructure\homologation-database-target.js'), 'guard', (New-Object Text.UTF8Encoding($false)))
  if (-not $OmitBootstrap) {
    [IO.File]::WriteAllText((Join-Path $contentRoot 'backend\dist\scripts\bootstrap-admin.js'), 'compiled bootstrap', (New-Object Text.UTF8Encoding($false)))
  }
  [IO.File]::WriteAllText((Join-Path $contentRoot 'frontend\dist\index.html'), '<html>DOCUMENTO DE TESTE — HOMOLOGAÇÃO</html>', (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText((Join-Path $contentRoot 'frontend\dist\assets\bundle.js'), 'AMBIENTE DE HOMOLOGAÇÃO', (New-Object Text.UTF8Encoding($false)))
  if ($CompleteRuntime) {
    $backendPackage.dependencies = [ordered]@{ '@prisma/client' = '7.10.1'; '@prisma/adapter-mariadb' = '7.10.1'; argon2 = '^0.45.1'; sharp = '^0.35.5' }
    $backendPackage.devDependencies = [ordered]@{ prisma = '7.10.1' }
    [IO.File]::WriteAllText((Join-Path $contentRoot 'backend\package.json'), (ConvertTo-Json $backendPackage -Depth 8), (New-Object Text.UTF8Encoding($false)))
    $lockRoot = [ordered]@{ name = $backendPackage.name; version = $backendPackage.version; dependencies = $backendPackage.dependencies; devDependencies = $backendPackage.devDependencies }
    if ($BadLock) { $lockRoot.dependencies = [ordered]@{ '@prisma/client' = '7.10.0' } }
    $lock = [ordered]@{ name = $backendPackage.name; version = $backendPackage.version; lockfileVersion = 3; packages = [ordered]@{ '' = $lockRoot } }
    $lockPath = Join-Path $contentRoot 'backend\package-lock.json'
    [IO.File]::WriteAllText($lockPath, (ConvertTo-Json $lock -Depth 12), (New-Object Text.UTF8Encoding($false)))
    $lockHash = (Get-FileHash -LiteralPath $lockPath -Algorithm SHA256).Hash.ToLowerInvariant()
    foreach ($name in @('@prisma/client', '@prisma/adapter-mariadb', 'argon2', 'sharp')) {
      if ($IncompleteRuntime -and $name -eq 'sharp') { continue }
      $moduleDir = Join-Path $contentRoot ('backend/node_modules/' + $name)
      [void][IO.Directory]::CreateDirectory($moduleDir)
      [IO.File]::WriteAllText((Join-Path $moduleDir 'package.json'), '{"version":"7.10.1"}', (New-Object Text.UTF8Encoding($false)))
    }
    [void][IO.Directory]::CreateDirectory((Join-Path $contentRoot 'backend\release'))
    [IO.File]::WriteAllText((Join-Path $contentRoot 'backend\release\Verify-BackendRuntime.mjs'), 'process.exitCode = 1;', (New-Object Text.UTF8Encoding($false)))
    $runtimeInfo = [ordered]@{ platform = 'win32'; arch = 'x64'; nodeMajor = 24; sourceCommit = $script:TestCommit; lockSha256 = $lockHash; prismaVersion = '7.10.1'; omit = 'dev,peer' }
    [IO.File]::WriteAllText((Join-Path $contentRoot 'backend\runtime-info.json'), (ConvertTo-Json $runtimeInfo), (New-Object Text.UTF8Encoding($false)))
    $manifest.releaseType = 'complete-runtime-update'
    $manifest.runtimeDependenciesIncluded = $true
    $manifest.runtimeDependenciesUnchanged = $false
    $manifest.platform = 'win32'
    $manifest.architecture = 'x64'
    $manifest.lockSha256 = $lockHash
    [IO.File]::WriteAllText((Join-Path $contentRoot 'release-manifest.json'), (ConvertTo-Json $manifest -Depth 8), (New-Object Text.UTF8Encoding($false)))
  }
  $sumLines = New-Object System.Collections.Generic.List[string]
  foreach ($file in Get-ChildItem -LiteralPath $contentRoot -Recurse -File | Sort-Object FullName) {
    $relative = $file.FullName.Substring($contentRoot.Length + 1).Replace('\', '/')
    $sum = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($WrongInternalHash -and $sumLines.Count -eq 0) { $sum = ('0' * 64) }
    $sumLines.Add($sum + '  ' + $relative)
  }
  [IO.File]::WriteAllLines((Join-Path $contentRoot 'SHA256SUMS.txt'), $sumLines, (New-Object Text.UTF8Encoding($false)))
  $archiveStream = New-Object IO.FileStream($zipPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  try {
    $archive = New-Object IO.Compression.ZipArchive($archiveStream, [IO.Compression.ZipArchiveMode]::Create, $true)
    try {
      foreach ($file in Get-ChildItem -LiteralPath $contentRoot -Recurse -File) {
        $relative = $file.FullName.Substring($contentRoot.Length + 1).Replace('\', '/')
        $entry = $archive.CreateEntry($relative, [IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $entry.Open()
        $sourceStream = [IO.File]::OpenRead($file.FullName)
        try { $sourceStream.CopyTo($entryStream) } finally { $sourceStream.Dispose(); $entryStream.Dispose() }
      }
    } finally { $archive.Dispose() }
  } finally { $archiveStream.Dispose() }
  if ($AddTraversal) {
    $archive = [IO.Compression.ZipFile]::Open($zipPath, [IO.Compression.ZipArchiveMode]::Update)
    try {
      $entry = $archive.CreateEntry('../escape.txt')
      $stream = $entry.Open()
      try {
        $bytes = [Text.Encoding]::UTF8.GetBytes('escape')
        $stream.Write($bytes, 0, $bytes.Length)
      } finally { $stream.Dispose() }
    } finally { $archive.Dispose() }
  }
  return $zipPath
}

function Get-TestPackageInfo {
  param([string]$Path)
  $hash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  return Get-ValidatedPackageInfo -Path $Path -ExpectedSha256 $hash -ExpectedCommit $script:TestCommit
}

function New-TransactionCase {
  param([string]$Name, [switch]$CompleteRuntime)
  $root = Join-Path $script:TestRoot ('tx-' + $Name)
  $install = Join-Path $root 'install'
  $prepared = Join-Path $root 'prepared'
  $backup = Join-Path $root 'backup'
  [void][IO.Directory]::CreateDirectory((Join-Path $install 'backend\dist'))
  [void][IO.Directory]::CreateDirectory((Join-Path $install 'frontend\dist'))
  [void][IO.Directory]::CreateDirectory((Join-Path $prepared 'backend\dist'))
  [void][IO.Directory]::CreateDirectory((Join-Path $prepared 'frontend\dist'))
  if (-not $CompleteRuntime) { [void][IO.Directory]::CreateDirectory((Join-Path $backup 'backend')) }
  [void][IO.Directory]::CreateDirectory((Join-Path $backup 'frontend'))
  [IO.File]::WriteAllText((Join-Path $install 'backend\dist\app.js'), 'old-backend')
  [IO.File]::WriteAllText((Join-Path $prepared 'backend\dist\app.js'), 'new-backend')
  [IO.File]::WriteAllText((Join-Path $install 'backend\package.json'), 'old-package')
  [IO.File]::WriteAllText((Join-Path $prepared 'backend\package.json'), 'new-package')
  [IO.File]::WriteAllText((Join-Path $install 'frontend\dist\app.js'), 'old-frontend')
  [IO.File]::WriteAllText((Join-Path $prepared 'frontend\dist\app.js'), 'new-frontend')
  [IO.File]::WriteAllText((Join-Path $install 'frontend\build-info.json'), 'old-build-info')
  [IO.File]::WriteAllText((Join-Path $prepared 'frontend\build-info.json'), 'new-build-info')
  $items = @(
    [pscustomobject]@{ Name = 'backend/dist'; TargetPath = Join-Path $install 'backend\dist'; PreparedPath = Join-Path $prepared 'backend\dist'; BackupPath = Join-Path $backup 'backend\dist'; FailedPath = Join-Path $backup 'failed-new\backend\dist'; OldMoved = $false; NewActive = $false; Restored = $false }
    [pscustomobject]@{ Name = 'backend/package.json'; TargetPath = Join-Path $install 'backend\package.json'; PreparedPath = Join-Path $prepared 'backend\package.json'; BackupPath = Join-Path $backup 'backend\package.json'; FailedPath = Join-Path $backup 'failed-new\backend\package.json'; OldMoved = $false; NewActive = $false; Restored = $false }
    [pscustomobject]@{ Name = 'frontend/dist'; TargetPath = Join-Path $install 'frontend\dist'; PreparedPath = Join-Path $prepared 'frontend\dist'; BackupPath = Join-Path $backup 'frontend\dist'; FailedPath = Join-Path $backup 'failed-new\frontend\dist'; OldMoved = $false; NewActive = $false; Restored = $false }
    [pscustomobject]@{ Name = 'frontend/build-info.json'; TargetPath = Join-Path $install 'frontend\build-info.json'; PreparedPath = Join-Path $prepared 'frontend\build-info.json'; BackupPath = Join-Path $backup 'frontend\build-info.json'; FailedPath = Join-Path $backup 'failed-new\frontend\build-info.json'; OldMoved = $false; NewActive = $false; Restored = $false }
  )
  if ($CompleteRuntime) {
    foreach ($relative in @('config\.env.homologation', 'config\Caddyfile', 'files\logo.png', 'certificates\fixture.crt', 'backups\previous.bak', 'logs\existing.log', 'winsw\service.xml')) {
      $persistent = Join-Path $install $relative
      [void][IO.Directory]::CreateDirectory((Split-Path -Parent $persistent))
      [IO.File]::WriteAllText($persistent, 'preserve-fixture')
    }
    foreach ($pair in @(@{ Root = $install; Version = '7.10.0' }, @{ Root = $prepared; Version = '7.10.1' })) {
      [void][IO.Directory]::CreateDirectory((Join-Path $pair.Root 'backend\node_modules\fixture'))
      [IO.File]::WriteAllText((Join-Path $pair.Root 'backend\node_modules\fixture\version'), $pair.Version)
      [IO.File]::WriteAllText((Join-Path $pair.Root 'backend\package-lock.json'), $pair.Version)
    }
    $items = @(New-ReleaseArtifactItems -InstallRoot $install -StageRoot $prepared -BackupRoot $backup -CompleteRuntime $true)
  }
  [pscustomobject]@{ Root = $root; Install = $install; Prepared = $prepared; Backup = $backup; Items = $items; Journal = Join-Path $backup 'journal.json' }
}

function New-TestOperations {
  param([hashtable]$State)
  $operations = @{
    MoveArtifact = {
      param($Source, $Destination)
      $State.MoveCount++
      if ($State.FailMoveCalls.ContainsKey([string]$State.MoveCount)) {
        $message = $State.FailMoveCalls[[string]$State.MoveCount]
        $State.FailMoveCalls.Remove([string]$State.MoveCount)
        throw $message
      }
      Move-UpdateArtifact -Source $Source -Destination $Destination
    }
    StopServices = { [void]($State.StopCount++) }
    WaitServicesStopped = { [void]($State.StoppedWaitCount++) }
    ValidateInstalledVersion = {
      if ($State.ContainsKey('FailInstalledVersion') -and $State.FailInstalledVersion) { throw 'simulated installed version validation failure' }
    }
    StartServices = {
      [void]($State.StartCount++)
      if ($State.FailFirstStart -and $State.StartCount -eq 1) { throw 'simulated service start failure' }
    }
    WaitServicesRunning = { [void]($State.RunningWaitCount++) }
    ValidateHttp = {
      [void]($State.HttpCount++)
      if ($State.FailFirstHttp -and $State.HttpCount -eq 1) { throw 'simulated HTTP validation failure' }
    }
  }
  foreach ($operationName in @($operations.Keys)) {
    $operations[$operationName] = $operations[$operationName].GetNewClosure()
  }
  return $operations
}

function Invoke-ExpectedRollback {
  param([psobject]$Case, [hashtable]$State, [string]$ExpectedError = '*rollback concluído*')
  $ops = New-TestOperations -State $State
  Assert-Throws -Action {
    Invoke-ArtifactSwapTransaction -Items $Case.Items -JournalPath $Case.Journal -SourceCommit $script:TestCommit -Operations $ops
  } -ExpectedPattern $ExpectedError
}

try {
  [void][IO.Directory]::CreateDirectory($script:TestRoot)
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem

  $validZip = New-TestZip -Name 'valid'
  $validInfo = Get-TestPackageInfo -Path $validZip
  Assert-Test ($validInfo.SourceCommit -ceq $script:TestCommit -and $validInfo.Entries.Count -ge 8) 'Valid package was not accepted.'
  if (-not [string]::IsNullOrWhiteSpace($PreparedPackagePath)) {
    $releaseInfo = Get-ValidatedPackageInfo -Path $PreparedPackagePath -ExpectedSha256 $ExpectedPackageSha256 -ExpectedCommit $ExpectedSourceCommit
    if ($releaseInfo.CompleteRuntime) {
      $releaseStage = Join-Path $script:TestRoot 'actual-release'
      Expand-ValidatedUpdatePackage -ZipPath $PreparedPackagePath -StageRoot $releaseStage -InstallRoot (Join-Path $script:TestRoot 'unused-install') -PackageInfo $releaseInfo
      Invoke-OfflineRuntimeValidation -BackendRoot (Join-Path $releaseStage 'backend')
    }
    Write-Output ('PASS: pacote release ' + $releaseInfo.SourceCommit + ' validado; Frontend ' + $releaseInfo.FrontendVersion + '.')
  }
  Assert-Throws {
    Get-ValidatedPackageInfo -Path $validZip -ExpectedSha256 ('0' * 64) -ExpectedCommit $script:TestCommit
  } '*SHA256 externo do pacote não confere*'
  Write-Output 'PASS: pacote homologation, commit, marcadores e hashes internos.'

  Assert-Test (-not (Assert-DependencyUpdateContract -InstalledPackage $validInfo.BackendPackage -PackageInfo $validInfo)) 'Pacote com dependências iguais foi recusado.'
  $completeZip = New-TestZip -Name 'complete-runtime' -CompleteRuntime
  $completeInfo = Get-TestPackageInfo $completeZip
  Assert-Test (Assert-DependencyUpdateContract -InstalledPackage $validInfo.BackendPackage -PackageInfo $completeInfo) 'Mudança completa de dependências não foi aceita.'
  $changedLegacyInfo = [pscustomobject]@{ BackendPackage = $completeInfo.BackendPackage; CompleteRuntime = $false }
  Assert-Throws { Assert-DependencyUpdateContract -InstalledPackage $validInfo.BackendPackage -PackageInfo $changedLegacyInfo } '*obrigatório pacote completo*'
  $incompleteZip = New-TestZip -Name 'incomplete-runtime' -CompleteRuntime -IncompleteRuntime
  Assert-Throws { Get-TestPackageInfo $incompleteZip } '*não contém todas as dependências*'
  $badLockZip = New-TestZip -Name 'bad-lock' -CompleteRuntime -BadLock
  Assert-Throws { Get-TestPackageInfo $badLockZip } '*Lockfile incompatível*'
  $badRuntimeStage = Join-Path $script:TestRoot 'bad-runtime-stage'
  Expand-ValidatedUpdatePackage -ZipPath $completeZip -StageRoot $badRuntimeStage -InstallRoot (Join-Path $script:TestRoot 'unused-install') -PackageInfo $completeInfo
  Assert-Throws { Invoke-OfflineRuntimeValidation -BackendRoot (Join-Path $badRuntimeStage 'backend') } '*Dependências de staging*'
  Assert-Test (-not (Test-Path -LiteralPath (Join-Path $script:TestRoot 'unused-install'))) 'Falha de preparo tocou na instalação ativa.'
  Write-Output 'PASS: dependências iguais, mudança completa, mudança incompleta, lockfile divergente e falha de preparo node_modules.'

  $installedRoot = Join-Path $script:TestRoot 'installed-release'
  [void][IO.Directory]::CreateDirectory((Join-Path $installedRoot 'backend\dist\scripts'))
  [void][IO.Directory]::CreateDirectory((Join-Path $installedRoot 'backend\dist\infrastructure'))
  [void][IO.Directory]::CreateDirectory((Join-Path $installedRoot 'frontend\dist\assets'))
  $installedPackage = [ordered]@{ name = 'sistema-gestor-os-backend'; version = $validInfo.BackendVersion }
  $installedInfo = [ordered]@{ environment = 'homologation'; sourceCommit = $validInfo.SourceCommit; frontendVersion = $validInfo.FrontendVersion; homologationMarkerVerified = $true }
  [IO.File]::WriteAllText((Join-Path $installedRoot 'backend\package.json'), (ConvertTo-Json $installedPackage), (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText((Join-Path $installedRoot 'frontend\build-info.json'), (ConvertTo-Json $installedInfo), (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText((Join-Path $installedRoot 'backend\dist\main.js'), 'backend', (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText((Join-Path $installedRoot 'backend\dist\scripts\bootstrap-admin.js'), 'bootstrap', (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText((Join-Path $installedRoot 'backend\dist\infrastructure\homologation-database-target.js'), 'guard', (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText((Join-Path $installedRoot 'frontend\dist\index.html'), '<html></html>', (New-Object Text.UTF8Encoding($false)))
  $installedBundlePath = Join-Path $installedRoot 'frontend\dist\assets\bundle.js'
  [IO.File]::WriteAllText($installedBundlePath, 'AMBIENTE DE HOMOLOGAÇÃO | DOCUMENTO DE TESTE — HOMOLOGAÇÃO', (New-Object Text.UTF8Encoding($false)))
  Assert-InstalledReleaseArtifacts -InstallRoot $installedRoot -PackageInfo $validInfo
  $wrongInstalledInfo = [ordered]@{ environment = 'homologation'; sourceCommit = ('0' * 40); frontendVersion = $validInfo.FrontendVersion; homologationMarkerVerified = $true }
  [IO.File]::WriteAllText((Join-Path $installedRoot 'frontend\build-info.json'), (ConvertTo-Json $wrongInstalledInfo), (New-Object Text.UTF8Encoding($false)))
  Assert-Throws { Assert-InstalledReleaseArtifacts -InstallRoot $installedRoot -PackageInfo $validInfo } '*não corresponde ao pacote aprovado*'
  [IO.File]::WriteAllText((Join-Path $installedRoot 'frontend\build-info.json'), (ConvertTo-Json $installedInfo), (New-Object Text.UTF8Encoding($false)))
  [IO.File]::WriteAllText($installedBundlePath, 'bundle sem marcadores', (New-Object Text.UTF8Encoding($false)))
  Assert-Throws { Assert-InstalledReleaseArtifacts -InstallRoot $installedRoot -PackageInfo $validInfo } '*não contém os marcadores*'
  Write-Output 'PASS: build-info, versões, bootstrap compilado e marcadores são conferidos nos artefatos instalados.'

  $invalidZip = Join-Path $script:TestRoot 'invalid.zip'
  [IO.File]::WriteAllText($invalidZip, 'not a zip')
  Assert-Throws { Get-TestPackageInfo -Path $invalidZip } '*'
  $badManifest = New-TestZip -Name 'bad-manifest' -BadEnvironment
  Assert-Throws { Get-TestPackageInfo -Path $badManifest } '*Manifesto incompatível*'
  $missingFile = New-TestZip -Name 'missing-bootstrap' -OmitBootstrap
  Assert-Throws { Get-TestPackageInfo -Path $missingFile } '*arquivo obrigatório ausente*'
  $wrongInternalHash = New-TestZip -Name 'wrong-internal-hash' -WrongInternalHash
  Assert-Throws { Get-TestPackageInfo -Path $wrongInternalHash } '*Hash interno inválido*'
  $traversal = New-TestZip -Name 'traversal' -AddTraversal
  Assert-Throws { Get-TestPackageInfo -Path $traversal } '*caminho ZIP*'
  Write-Output 'PASS: ZIP inválido, manifesto, arquivo ausente, hash incorreto e path traversal são recusados.'

  $stage = Join-Path $script:TestRoot 'stage-failure'
  Assert-Throws {
    Expand-ValidatedUpdatePackage -ZipPath $validZip -StageRoot $stage -InstallRoot (Join-Path $script:TestRoot 'install') -PackageInfo $validInfo -BeforeWrite { throw 'simulated staging failure' }
  } '*simulated staging failure*'
  Assert-Test (-not (Test-Path -LiteralPath $stage)) 'Staging parcial não foi removido após falha.'
  $occupied = Join-Path $script:TestRoot 'backup-occupied'
  [IO.File]::WriteAllText($occupied, 'preserve-me')
  Assert-Throws { New-ExclusiveUpdateDirectory -Path $occupied } '*já existe*'
  Assert-Test ((Get-Content -LiteralPath $occupied -Raw) -ceq 'preserve-me') 'Falha ao criar backup sobrescreveu o arquivo existente.'
  $lockPath = Join-Path $script:TestRoot 'exclusive.lock'
  $lockOne = Open-ExclusiveUpdateLock -Path $lockPath -UpdateId 'test-one'
  Assert-Throws { Open-ExclusiveUpdateLock -Path $lockPath -UpdateId 'test-two' } '*'
  $lockOne.Dispose()
  Remove-Item -LiteralPath $lockPath -Force
  $lockTwo = Open-ExclusiveUpdateLock -Path $lockPath -UpdateId 'test-two'
  $lockTwo.Dispose()
  Remove-Item -LiteralPath $lockPath -Force
  Write-Output 'PASS: falha no preparo limpa somente o staging próprio; destino de backup existente é preservado.'
  Write-Output 'PASS: lock exclusivo impede duas atualizações concorrentes.'

  $envFile = Join-Path $script:TestRoot 'valid.env'
  $fakeCredential = 'test-only-never-log-this'
  $validEnv = @(
    'GOS_DEPLOYMENT_ENV=homologation'
    'GOS_DATABASE_TARGET=gestor_os_homologation'
    'GOS_EXTERNAL_EFFECTS_ENABLED=false'
    ('DATABASE_URL=mysql://gos_homologation_app:' + $fakeCredential + '@127.0.0.1:3306/gestor_os_homologation')
    'PORT=3100'
  )
  [IO.File]::WriteAllLines($envFile, $validEnv, (New-Object Text.UTF8Encoding($false)))
  Assert-HomologationEnvironmentFile -Path $envFile
  $wrongDbEnv = $validEnv.Clone()
  $wrongDbEnv[3] = ('DATABASE_URL=mysql://gos_homologation_app:' + $fakeCredential + '@127.0.0.1:3306/gestor_os')
  [IO.File]::WriteAllLines($envFile, $wrongDbEnv, (New-Object Text.UTF8Encoding($false)))
  $envError = $null
  try { Assert-HomologationEnvironmentFile -Path $envFile } catch { $envError = $_.Exception.Message }
  Assert-Test ($envError -like '*inválida*' -and $envError -notlike ('*' + $fakeCredential + '*')) 'Environment rejection leaked credential data or accepted the wrong DB.'
  Write-Output 'PASS: validação offline aceita somente URL local do banco homologation e não revela credenciais.'

  $successCase = New-TransactionCase -Name 'success'
  $successState = @{ MoveCount = 0; StopCount = 0; StoppedWaitCount = 0; StartCount = 0; RunningWaitCount = 0; HttpCount = 0; FailMoveCalls = @{}; FailFirstStart = $false; FailFirstHttp = $false }
  $successOps = New-TestOperations -State $successState
  $success = Invoke-ArtifactSwapTransaction -Items $successCase.Items -JournalPath $successCase.Journal -SourceCommit $script:TestCommit -Operations $successOps
  Assert-Test $success.Success 'Successful transaction did not report success.'
  Assert-Test ((Get-Content -LiteralPath (Join-Path $successCase.Install 'backend\dist\app.js') -Raw) -ceq 'new-backend') 'Backend new payload missing after success.'
  Assert-Test ((Get-Content -LiteralPath (Join-Path $successCase.Install 'frontend\dist\app.js') -Raw) -ceq 'new-frontend') 'Frontend new payload missing after success.'
  Assert-Test ((Get-Content -LiteralPath (Join-Path $successCase.Backup 'backend\dist\app.js') -Raw) -ceq 'old-backend') 'Backend backup missing after success.'
  Assert-Test ((Get-Content -LiteralPath $successCase.Journal -Raw | ConvertFrom-Json).status -ceq 'success') 'Success was not journaled.'
  Write-Output 'PASS: atualização feliz preserva versão anterior e grava journal.'

  $versionFailCase = New-TransactionCase -Name 'installed-version-validation-failure'
  $versionFailState = @{ MoveCount = 0; StopCount = 0; StoppedWaitCount = 0; StartCount = 0; RunningWaitCount = 0; HttpCount = 0; FailMoveCalls = @{}; FailFirstStart = $false; FailFirstHttp = $false; FailInstalledVersion = $true }
  Invoke-ExpectedRollback -Case $versionFailCase -State $versionFailState
  Assert-Test ((Get-Content -LiteralPath (Join-Path $versionFailCase.Install 'backend\dist\app.js') -Raw) -ceq 'old-backend') 'Installed version validation failure did not restore old artifacts.'
  Assert-Test ($versionFailState.StartCount -eq 1) 'Services were started before installed version validation passed.'
  Write-Output 'PASS: manifesto/versão instalados são verificados antes de iniciar os serviços; falha dispara rollback.'

  $backupFailCase = New-TransactionCase -Name 'backup-failure'
  [void][IO.Directory]::CreateDirectory((Join-Path $backupFailCase.Backup 'backend\dist'))
  [IO.File]::WriteAllText((Join-Path $backupFailCase.Backup 'backend\dist\preserve.txt'), 'existing-backup')
  $backupFailState = @{ MoveCount = 0; StopCount = 0; StoppedWaitCount = 0; StartCount = 0; RunningWaitCount = 0; HttpCount = 0; FailMoveCalls = @{}; FailFirstStart = $false; FailFirstHttp = $false }
  Invoke-ExpectedRollback -Case $backupFailCase -State $backupFailState
  Assert-Test ((Get-Content -LiteralPath (Join-Path $backupFailCase.Install 'backend\dist\app.js') -Raw) -ceq 'old-backend') 'Backup failure changed the active Backend.'
  Assert-Test ((Get-Content -LiteralPath (Join-Path $backupFailCase.Backup 'backend\dist\preserve.txt') -Raw) -ceq 'existing-backup') 'Backup failure overwrote an existing backup artifact.'
  Write-Output 'PASS: colisão/falha ao criar o backup não troca nem sobrescreve artefatos.'

  $backendFailCase = New-TransactionCase -Name 'backend-activation-failure'
  $backendFailState = @{ MoveCount = 0; StopCount = 0; StoppedWaitCount = 0; StartCount = 0; RunningWaitCount = 0; HttpCount = 0; FailMoveCalls = @{ '5' = 'simulated backend activation failure' }; FailFirstStart = $false; FailFirstHttp = $false }
  Invoke-ExpectedRollback -Case $backendFailCase -State $backendFailState
  Assert-Test ((Get-Content -LiteralPath (Join-Path $backendFailCase.Install 'backend\dist\app.js') -Raw) -ceq 'old-backend') 'Backend rollback did not restore old bytes.'
  Write-Output 'PASS: falha de ativação do Backend restaura versão anterior.'

  $frontendFailCase = New-TransactionCase -Name 'frontend-activation-failure'
  $frontendFailState = @{ MoveCount = 0; StopCount = 0; StoppedWaitCount = 0; StartCount = 0; RunningWaitCount = 0; HttpCount = 0; FailMoveCalls = @{ '7' = 'simulated frontend activation failure' }; FailFirstStart = $false; FailFirstHttp = $false }
  Invoke-ExpectedRollback -Case $frontendFailCase -State $frontendFailState
  Assert-Test ((Get-Content -LiteralPath (Join-Path $frontendFailCase.Install 'backend\dist\app.js') -Raw) -ceq 'old-backend') 'Frontend failure did not restore Backend.'
  Assert-Test ((Get-Content -LiteralPath (Join-Path $frontendFailCase.Install 'frontend\dist\app.js') -Raw) -ceq 'old-frontend') 'Frontend rollback did not restore old bytes.'
  Write-Output 'PASS: falha de ativação do Frontend restaura ambos os componentes.'

  $startFailCase = New-TransactionCase -Name 'service-start-failure'
  $startFailState = @{ MoveCount = 0; StopCount = 0; StoppedWaitCount = 0; StartCount = 0; RunningWaitCount = 0; HttpCount = 0; FailMoveCalls = @{}; FailFirstStart = $true; FailFirstHttp = $false }
  Invoke-ExpectedRollback -Case $startFailCase -State $startFailState
  Assert-Test ((Get-Content -LiteralPath (Join-Path $startFailCase.Install 'frontend\build-info.json') -Raw) -ceq 'old-build-info') 'Service start failure did not restore build-info.'
  Write-Output 'PASS: falha ao iniciar serviço restaura artefatos e reinicia a versão anterior.'

  $httpFailCase = New-TransactionCase -Name 'http-validation-failure'
  $httpFailState = @{ MoveCount = 0; StopCount = 0; StoppedWaitCount = 0; StartCount = 0; RunningWaitCount = 0; HttpCount = 0; FailMoveCalls = @{}; FailFirstStart = $false; FailFirstHttp = $true }
  Invoke-ExpectedRollback -Case $httpFailCase -State $httpFailState
  Assert-Test ((Get-Content -LiteralPath (Join-Path $httpFailCase.Install 'backend\package.json') -Raw) -ceq 'old-package') 'HTTP validation failure did not restore package.json.'
  Write-Output 'PASS: falha de validação HTTP dispara rollback completo.'

  $rollbackFailCase = New-TransactionCase -Name 'rollback-failure'
  $rollbackFailState = @{ MoveCount = 0; StopCount = 0; StoppedWaitCount = 0; StartCount = 0; RunningWaitCount = 0; HttpCount = 0; FailMoveCalls = @{ '7' = 'simulated frontend activation failure'; '8' = 'simulated restore failure' }; FailFirstStart = $false; FailFirstHttp = $false }
  Invoke-ExpectedRollback -Case $rollbackFailCase -State $rollbackFailState -ExpectedError '*ROLLBACK INCOMPLETO*'
  Assert-Test ((Get-Content -LiteralPath $rollbackFailCase.Journal -Raw | ConvertFrom-Json).status -ceq 'rollback-incomplete') 'Incomplete rollback was not recorded.'
  Assert-Test ($rollbackFailState.StartCount -eq 0) 'Services were started after an incomplete rollback.'
  Write-Output 'PASS: falha no rollback é explicitamente sinalizada e serviços não são reiniciados em estado misto.'

  foreach ($scenario in @('success', 'activation', 'api-start', 'api-http', 'version', 'rollback')) {
    $fullCase = New-TransactionCase -Name ('full-' + $scenario) -CompleteRuntime
    $fullState = @{ MoveCount = 0; StopCount = 0; StoppedWaitCount = 0; StartCount = 0; RunningWaitCount = 0; HttpCount = 0;
      FailMoveCalls = @{}; FailFirstStart = ($scenario -eq 'api-start'); FailFirstHttp = ($scenario -eq 'api-http'); FailInstalledVersion = ($scenario -eq 'version') }
    if ($scenario -eq 'activation') { $fullState.FailMoveCalls = @{ '4' = 'simulated full Backend activation failure' } }
    if ($scenario -eq 'rollback') { $fullState.FailMoveCalls = @{ '5' = 'simulated frontend activation failure'; '6' = 'simulated full restore failure' } }
    if ($scenario -eq 'success') {
      $fullOps = New-TestOperations $fullState
      [void](Invoke-ArtifactSwapTransaction -Items $fullCase.Items -JournalPath $fullCase.Journal -SourceCommit $script:TestCommit -Operations $fullOps)
      Assert-Test ((Get-Content -LiteralPath (Join-Path $fullCase.Install 'backend\node_modules\fixture\version') -Raw) -ceq '7.10.1') 'Runtime novo não foi ativado integralmente.'
      Assert-Test ((Get-Content -LiteralPath (Join-Path $fullCase.Backup 'backend\node_modules\fixture\version') -Raw) -ceq '7.10.0') 'Dependências anteriores não foram preservadas.'
    } elseif ($scenario -eq 'rollback') {
      Invoke-ExpectedRollback -Case $fullCase -State $fullState -ExpectedError '*ROLLBACK INCOMPLETO*'
      Assert-Test ($fullState.StartCount -eq 0) 'Runtime misto foi iniciado após falha no rollback completo.'
      Assert-Test ((Get-Content -LiteralPath $fullCase.Journal -Raw | ConvertFrom-Json).status -ceq 'rollback-incomplete') 'Falha no rollback completo não foi registrada.'
    } else {
      Invoke-ExpectedRollback -Case $fullCase -State $fullState
      Assert-Test ((Get-Content -LiteralPath (Join-Path $fullCase.Install 'backend\node_modules\fixture\version') -Raw) -ceq '7.10.0') 'node_modules anterior não foi restaurado.'
      Assert-Test ((Get-Content -LiteralPath (Join-Path $fullCase.Install 'backend\package-lock.json') -Raw) -ceq '7.10.0') 'Lockfile anterior não foi restaurado.'
      Assert-Test ((Get-Content -LiteralPath (Join-Path $fullCase.Install 'backend\dist\app.js') -Raw) -ceq 'old-backend') 'Código anterior não foi restaurado junto às dependências.'
      Assert-Test ((Get-Content -LiteralPath (Join-Path $fullCase.Install 'frontend\dist\app.js') -Raw) -ceq 'old-frontend') 'Frontend anterior não foi restaurado.'
    }
    foreach ($relative in @('config\.env.homologation', 'config\Caddyfile', 'files\logo.png', 'certificates\fixture.crt', 'backups\previous.bak', 'logs\existing.log', 'winsw\service.xml')) {
      Assert-Test ((Get-Content -LiteralPath (Join-Path $fullCase.Install $relative) -Raw) -ceq 'preserve-fixture') 'Arquivo persistente/configuração foi alterado pela atualização.'
    }
    Write-Output ('PASS: runtime integral (dist + package + lock + node_modules), persistência e configurações preservadas, cenário ' + $scenario + '.')
  }

  $sourceWhatIfIndex = $source.IndexOf('if ($WhatIfPreference) {', [StringComparison]::Ordinal)
  $whatIfReturnIndex = $source.IndexOf('return', $sourceWhatIfIndex, [StringComparison]::Ordinal)
  $applyCallIndex = $source.IndexOf('Invoke-HomologationUpdateApply -PackageInfo', [StringComparison]::Ordinal)
  if ($sourceWhatIfIndex -lt 0 -or $whatIfReturnIndex -lt $sourceWhatIfIndex -or $applyCallIndex -lt $whatIfReturnIndex) {
    throw '-WhatIf não retorna antes da chamada que cria staging, journal, lock ou altera serviços.'
  }
  Write-Output 'PASS: caminho -WhatIf retorna antes de qualquer operação mutável.'
  $entrypointIndex = $source.LastIndexOf('$installRoot = $script:ExpectedInstallRoot', [StringComparison]::Ordinal)
  if ($entrypointIndex -lt 0) { throw 'Entrada do atualizador não encontrada para teste WhatIf.' }
  $previewHeader = @'
[CmdletBinding(SupportsShouldProcess = $true)]
param([string]$PackagePath, [switch]$Apply)

'@
  $preview = [scriptblock]::Create($previewHeader + $source.Substring($entrypointIndex))
  foreach ($previewPackage in @($validZip, $completeZip)) {
    & {
      param($Preview, $PreviewPackage)
      $script:ExpectedInstallRoot = Join-Path $script:TestRoot 'whatif-no-write'
      $script:ExpectedPackageSha256 = (Get-FileHash -LiteralPath $PreviewPackage -Algorithm SHA256).Hash.ToLowerInvariant()
      $script:ExpectedSourceCommit = $script:TestCommit
      $script:LoginMarker = 'AMBIENTE DE HOMOLOGAÇÃO'
      $script:DocumentMarker = 'DOCUMENTO DE TESTE — HOMOLOGAÇÃO'
      function Assert-UpdateDestination { param($InstallRoot, $PackageInfo) }
      function Assert-Administrator { throw 'WhatIf tentou iniciar o caminho administrativo mutável.' }
      function New-ServiceOperations { throw 'WhatIf tentou preparar operações de serviço.' }
      function Invoke-HomologationUpdateApply { throw 'WhatIf tentou executar alterações.' }
      & $Preview -PackagePath $PreviewPackage -Apply -WhatIf | Out-Null
      Assert-Test (-not (Test-Path -LiteralPath $script:ExpectedInstallRoot)) 'WhatIf criou arquivos de destino.'
    } $preview $previewPackage
  }
  Write-Output 'PASS: entrada real -Apply -WhatIf executada para formatos legado/completo com destino e serviços simulados; nenhuma mutação foi alcançada.'
  Write-Output 'PASS: todos os cenários foram executados em PowerShell sem serviços ou bancos reais.'
} finally {
  if ($env:GOS_TEST_KEEP_ARTIFACTS -ne '1' -and (Test-Path -LiteralPath $script:TestRoot)) {
    Remove-Item -LiteralPath $script:TestRoot -Recurse -Force
  }
}
