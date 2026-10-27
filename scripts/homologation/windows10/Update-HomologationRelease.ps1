[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$PackagePath,
  [ValidatePattern('^[a-fA-F0-9]{64}$')]
  [string]$ExpectedPackageSha256 = 'e141f2ffe8af84f3c1cb3f46540af9e06a083c1b887a650485ee0425d52db7e6',
  [ValidatePattern('^([a-fA-F0-9]{40}|snapshot:[a-fA-F0-9]{64})$')]
  [string]$ExpectedSourceCommit = '1f98609e778757aaa5c4488e4d8787040396d62c',
  [switch]$Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:ExpectedPackageSha256 = $ExpectedPackageSha256.ToLowerInvariant()
$script:ExpectedSourceCommit = $ExpectedSourceCommit.ToLowerInvariant()
$script:ExpectedInstallRoot = 'C:\ProgramData\GestorOS\homologation'
$script:ExpectedHost = 'gestor-os.home.arpa'
$script:ExpectedServices = @('GestorOSBackendHomologation', 'GestorOSCaddyHomologation')
$script:LoginMarker = 'AMBIENTE DE HOMOLOGAÇÃO'
$script:DocumentMarker = 'DOCUMENTO DE TESTE — HOMOLOGAÇÃO'

function Get-StreamSha256 {
  param([Parameter(Mandatory = $true)][System.IO.Stream]$Stream)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $sha.ComputeHash($Stream)
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-ZipEntryText {
  param([Parameter(Mandatory = $true)][System.IO.Compression.ZipArchiveEntry]$Entry)
  $stream = $Entry.Open()
  try {
    $reader = New-Object System.IO.StreamReader($stream, (New-Object System.Text.UTF8Encoding($false, $true)), $true)
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
  } finally {
    if ($stream) { $stream.Dispose() }
  }
}

function Assert-SafeZipEntryPath {
  param([Parameter(Mandatory = $true)][string]$Name)
  if ([string]::IsNullOrWhiteSpace($Name) -or $Name.Length -gt 240 -or $Name.StartsWith('/') -or $Name.StartsWith('\') -or $Name.Contains('\') -or $Name.Contains(':')) {
    throw ('Pacote recusado: caminho ZIP absoluto, ambíguo ou longo demais (length=' + $Name.Length +
      ', leadingSlash=' + $Name.StartsWith('/') + ', leadingBackslash=' + $Name.StartsWith('\') +
      ', backslash=' + $Name.Contains('\') + ', colon=' + $Name.Contains(':') + ').')
  }
  $parts = $Name.TrimEnd('/').Split('/')
  if ($parts.Count -eq 0) { throw 'Pacote recusado: caminho ZIP vazio.' }
  foreach ($part in $parts) {
    if ([string]::IsNullOrWhiteSpace($part) -or $part -eq '.' -or $part -eq '..' -or $part -match '[\x00-\x1f<>:"|?*]' -or $part.EndsWith('.') -or $part.EndsWith(' ')) {
      throw 'Pacote recusado: caminho ZIP inseguro.'
    }
    if ($part -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$') { throw 'Pacote recusado: nome reservado pelo Windows.' }
  }
  if ($Name -match '(^|/)(\.env[^/]*|\.npmrc|backups?)(/|$)' -or $Name -match 'Usuarios e senhas\.txt') {
    throw 'Pacote recusado: contém caminho de configuração, dependências, backup ou arquivo de usuário.'
  }
}

function Get-DependencySignature {
  param([psobject]$Package)
  $parts = @()
  foreach ($section in @('dependencies', 'devDependencies', 'optionalDependencies', 'overrides')) {
    $property = $Package.PSObject.Properties[$section]
    if ($null -eq $property) { continue }
    foreach ($entry in @($property.Value.PSObject.Properties | Sort-Object Name)) {
      $parts += $section + ':' + $entry.Name + '=' + (ConvertTo-Json -InputObject $entry.Value -Compress -Depth 12)
    }
  }
  return $parts -join ';'
}

function Read-PackageLockJson {
  param([string]$Text)
  # ConvertFrom-Json in Windows PowerShell 5.1 rejects packages[""].
  Add-Type -AssemblyName System.Web.Extensions
  $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $serializer.MaxJsonLength = 16777216
  $serializer.RecursionLimit = 200
  return ,$serializer.DeserializeObject($Text)
}

function Assert-LockMatchesPackage {
  param([psobject]$Package, [psobject]$Lock)
  if ($Lock.lockfileVersion -ne 3 -or -not $Lock.packages.ContainsKey('') -or $Lock.name -cne $Package.name -or $Lock.version -cne $Package.version) {
    throw 'Lockfile incompatível com package.json.'
  }
  $root = $Lock.packages['']
  foreach ($section in @('dependencies', 'devDependencies', 'optionalDependencies')) {
    $packageValues = @()
    $lockValues = @()
    if ($null -ne $Package.PSObject.Properties[$section]) {
      $packageValues = @($Package.$section.PSObject.Properties | Sort-Object Name | ForEach-Object { $_.Name + '=' + $_.Value })
    }
    if ($root.ContainsKey($section)) {
      $lockValues = @($root[$section].Keys | Sort-Object | ForEach-Object { $_ + '=' + $root[$section][$_] })
    }
    if (($packageValues -join ';') -cne ($lockValues -join ';')) { throw 'Lockfile incompatível com as dependências declaradas.' }
  }
  $prismaVersion = $Package.dependencies.'@prisma/client'
  if ($prismaVersion -notmatch '^7\.10\.\d+$' -or $Package.dependencies.'@prisma/adapter-mariadb' -cne $prismaVersion -or $Package.devDependencies.prisma -cne $prismaVersion) {
    throw 'Prisma Client, adapter e CLI precisam estar alinhados.'
  }
}

function Assert-DependencyUpdateContract {
  param([psobject]$InstalledPackage, [psobject]$PackageInfo)
  if ($InstalledPackage.name -cne 'sistema-gestor-os-backend') { throw 'Backend instalado não corresponde ao produto esperado.' }
  $changed = (Get-DependencySignature $InstalledPackage) -cne (Get-DependencySignature $PackageInfo.BackendPackage)
  if ($changed -and -not $PackageInfo.CompleteRuntime) { throw 'Dependências declaradas mudaram; é obrigatório pacote completo com lockfile e node_modules validados.' }
  return $changed
}

function Invoke-OfflineRuntimeValidation {
  param([string]$BackendRoot, [string]$NodePath = 'C:\Program Files\nodejs\node.exe')
  $verifier = Join-Path $BackendRoot 'release\Verify-BackendRuntime.mjs'
  if (-not (Test-Path -LiteralPath $verifier -PathType Leaf)) { throw 'Validador offline de runtime ausente.' }
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = $NodePath
  $start.Arguments = '"' + $verifier + '"'
  $start.WorkingDirectory = $BackendRoot
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.EnvironmentVariables.Clear()
  foreach ($key in @('SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA')) {
    $value = [Environment]::GetEnvironmentVariable($key)
    if ($null -ne $value) { $start.EnvironmentVariables[$key] = $value }
  }
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $start
  try {
    [void]$process.Start()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(90000)) { $process.Kill(); throw 'Validação offline excedeu o prazo; somente o processo de verificação foi encerrado.' }
    $stdout = $stdoutTask.Result
    [void]$stderrTask.Result
    if ($process.ExitCode -ne 0) { throw 'Dependências de staging/runtime, lockfile, código compilado ou módulos nativos incompatíveis.' }
    $report = $stdout | ConvertFrom-Json -ErrorAction Stop
    if ($report.platform -cne 'win32' -or $report.arch -cne 'x64' -or $report.argon2 -cne 'passed' -or $report.sharp -cne 'passed' -or $report.bootstrapGuard -cne 'passed') {
      throw 'Relatório de validação offline incompleto.'
    }
  } finally { $process.Dispose() }
}

function Get-ValidatedPackageInfo {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256,
    [Parameter(Mandatory = $true)][string]$ExpectedCommit,
    [string]$LoginMarker = 'AMBIENTE DE HOMOLOGAÇÃO',
    [string]$DocumentMarker = 'DOCUMENTO DE TESTE — HOMOLOGAÇÃO'
  )

  if ($ExpectedSha256 -notmatch '^[0-9a-fA-F]{64}$' -or $ExpectedCommit -notmatch '^([0-9a-fA-F]{40}|snapshot:[0-9a-fA-F]{64})$') {
    throw 'Hash ou commit esperado possui formato inválido.'
  }
  $resolvedPath = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).ProviderPath
  Add-Type -AssemblyName System.IO.Compression
  $archiveStream = New-Object System.IO.FileStream($resolvedPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  $zip = $null
  try {
    $archiveHash = Get-StreamSha256 -Stream $archiveStream
    if ($archiveHash -cne $ExpectedSha256.ToLowerInvariant()) { throw 'SHA256 externo do pacote não confere.' }
    $archiveStream.Position = 0
    $zip = New-Object System.IO.Compression.ZipArchive($archiveStream, [System.IO.Compression.ZipArchiveMode]::Read, $true)
    $files = @{}
    $directories = @{}
    $totalLength = [int64]0
    foreach ($entry in $zip.Entries) {
      Assert-SafeZipEntryPath -Name $entry.FullName
      $isDirectory = $entry.FullName.EndsWith('/')
      $key = $entry.FullName.TrimEnd('/')
      if ($files.ContainsKey($key) -or $directories.ContainsKey($key)) { throw 'Pacote recusado: caminhos duplicados no ZIP.' }
      $unixType = ($entry.ExternalAttributes -shr 16) -band 0xF000
      if ($unixType -eq 0xA000) { throw 'Pacote recusado: links simbólicos não são permitidos.' }
      if ($isDirectory) {
        if (-not ($key -ceq 'backend' -or $key -match '^backend/(dist|node_modules|release)(/|$)' -or
            $key -ceq 'frontend' -or $key.StartsWith('frontend/dist/', [StringComparison]::Ordinal) -or $key -ceq 'frontend/dist')) {
          throw 'Pacote recusado: diretório fora dos artefatos aprovados.'
        }
        $directories[$key] = $entry
        continue
      }
      if ($entry.Length -gt 52428800) { throw 'Pacote recusado: um arquivo excede o limite individual de 50 MiB.' }
      $totalLength += $entry.Length
      if ($totalLength -gt 1073741824) { throw 'Pacote recusado: tamanho descompactado excede 1 GiB.' }
      if (-not ($key -eq 'release-manifest.json' -or $key -eq 'SHA256SUMS.txt' -or $key -eq 'backend/package.json' -or
          $key.StartsWith('backend/dist/', [StringComparison]::Ordinal) -or $key.StartsWith('backend/node_modules/', [StringComparison]::Ordinal) -or
          $key -eq 'backend/package-lock.json' -or $key -eq 'backend/runtime-info.json' -or $key -eq 'backend/release/Verify-BackendRuntime.mjs' -or $key -eq 'frontend/build-info.json' -or
          $key.StartsWith('frontend/dist/', [StringComparison]::Ordinal))) {
        throw 'Pacote recusado: contém arquivo fora dos artefatos aprovados.'
      }
      $files[$key] = $entry
    }

    foreach ($required in @(
      'release-manifest.json', 'SHA256SUMS.txt', 'backend/package.json', 'backend/dist/main.js',
      'backend/dist/scripts/bootstrap-admin.js', 'backend/dist/infrastructure/homologation-database-target.js'
    )) {
      if (-not $files.ContainsKey($required)) { throw "Pacote incompleto: arquivo obrigatório ausente ($required)." }
    }

    $manifestText = Get-ZipEntryText -Entry $files['release-manifest.json']
    $manifest = $manifestText | ConvertFrom-Json -ErrorAction Stop
    $completeRuntime = $manifest.releaseType -ceq 'complete-runtime-update'
    $legacyRuntime = $manifest.releaseType -ceq 'artifact-update'
    $backendOnly = $manifest.PSObject.Properties['scope'] -and $manifest.scope -ceq 'backend-only'
    $snapshot = $ExpectedCommit.StartsWith('snapshot:', [StringComparison]::Ordinal)
    $provenanceMatches = $manifest.sourceCommit -ceq $ExpectedCommit
    if ($snapshot) {
      $provenanceMatches = $null -eq $manifest.sourceCommit -and $manifest.PSObject.Properties['sourceSnapshotSha256'] -and
        $manifest.sourceSnapshotSha256 -ceq $ExpectedCommit.Substring(9) -and $manifest.baseCommit -cmatch '^[0-9a-f]{40}$'
      if (-not $backendOnly -or -not $completeRuntime) { throw 'Snapshot exige pacote completo exclusivo do Backend.' }
    }
    if ($backendOnly -and (-not $completeRuntime -or @($files.Keys | Where-Object { $_ -like 'frontend/*' }).Count -ne 0)) { throw 'Escopo exclusivo do Backend contém artefatos inesperados.' }
    if ($backendOnly -and -not $files.ContainsKey('backend/dist/infrastructure/prisma/mysql-connection-options.js')) { throw 'Helper MySQL obrigatório ausente.' }
    if ($manifest.environment -cne 'homologation' -or (-not $completeRuntime -and -not $legacyRuntime) -or
        -not $provenanceMatches -or $manifest.nodeVersion -notmatch '^v24\.') {
      throw 'Manifesto incompatível com esta atualização de homologação.'
    }
    if ($completeRuntime) {
      if ($manifest.runtimeDependenciesIncluded -ne $true -or $manifest.platform -cne 'win32' -or $manifest.architecture -cne 'x64') { throw 'Manifesto não confirma runtime Windows x64 completo.' }
      foreach ($required in @('backend/package-lock.json', 'backend/runtime-info.json', 'backend/release/Verify-BackendRuntime.mjs',
          'backend/node_modules/@prisma/client/package.json', 'backend/node_modules/@prisma/adapter-mariadb/package.json',
          'backend/node_modules/argon2/package.json', 'backend/node_modules/sharp/package.json')) {
        if (-not $files.ContainsKey($required)) { throw 'Pacote completo não contém todas as dependências e metadados obrigatórios.' }
      }
    } elseif ($manifest.runtimeDependenciesIncluded -ne $false -or $manifest.runtimeDependenciesUnchanged -ne $true -or
        @($files.Keys | Where-Object { $_ -match '^backend/(node_modules/|release/|package-lock.json$|runtime-info.json$)' }).Count -gt 0) {
      throw 'Pacote legado não pode conter dependências ou declarar alterações de runtime.'
    }
    if (-not $backendOnly) {
    foreach ($required in @('frontend/build-info.json', 'frontend/dist/index.html')) { if (-not $files.ContainsKey($required)) { throw 'Frontend incompleto.' } }
    $buildInfo = (Get-ZipEntryText -Entry $files['frontend/build-info.json']) | ConvertFrom-Json -ErrorAction Stop
    if ($buildInfo.environment -cne 'homologation' -or $buildInfo.sourceCommit -cne $ExpectedCommit -or
        $buildInfo.frontendVersion -cne $manifest.frontendVersion -or $buildInfo.homologationMarkerVerified -ne $true) {
      throw 'Manifesto do Frontend incompatível com a versão aprovada.'
    }
    }

    $backendPackage = (Get-ZipEntryText -Entry $files['backend/package.json']) | ConvertFrom-Json -ErrorAction Stop
    if ($backendPackage.name -cne 'sistema-gestor-os-backend' -or $backendPackage.version -cne $manifest.backendVersion) {
      throw 'package.json do Backend não corresponde ao manifesto.'
    }
    if ($completeRuntime) {
      $lock = Read-PackageLockJson -Text (Get-ZipEntryText -Entry $files['backend/package-lock.json'])
      Assert-LockMatchesPackage -Package $backendPackage -Lock $lock
      $lockStream = $files['backend/package-lock.json'].Open()
      try { $lockHash = Get-StreamSha256 -Stream $lockStream } finally { $lockStream.Dispose() }
      $runtimeInfo = (Get-ZipEntryText -Entry $files['backend/runtime-info.json']) | ConvertFrom-Json
      $runtimeProvenanceMatches = $runtimeInfo.sourceCommit -ceq $ExpectedCommit
      if ($snapshot) { $runtimeProvenanceMatches = $null -eq $runtimeInfo.sourceCommit -and
        $runtimeInfo.sourceSnapshotSha256 -ceq $manifest.sourceSnapshotSha256 -and $runtimeInfo.baseCommit -ceq $manifest.baseCommit }
      if ($lockHash -cne $manifest.lockSha256 -or $runtimeInfo.lockSha256 -cne $lockHash -or
          -not $runtimeProvenanceMatches -or $runtimeInfo.platform -cne 'win32' -or $runtimeInfo.arch -cne 'x64' -or
          $runtimeInfo.nodeMajor -ne 24 -or $runtimeInfo.prismaVersion -cne $backendPackage.dependencies.'@prisma/client' -or $runtimeInfo.omit -cne 'dev,peer') {
        throw 'Lockfile ou runtime-info incompatível com o manifesto.'
      }
    }

    $sumText = Get-ZipEntryText -Entry $files['SHA256SUMS.txt']
    $sums = @{}
    foreach ($line in ($sumText -split '\r\n|\n|\r')) {
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      if ($line -notmatch '^([0-9a-fA-F]{64})  (.+)$') { throw 'SHA256SUMS.txt possui uma linha inválida.' }
      $sumName = $Matches[2]
      if ($sums.ContainsKey($sumName)) { throw 'SHA256SUMS.txt possui caminhos duplicados.' }
      Assert-SafeZipEntryPath -Name $sumName
      if (-not $files.ContainsKey($sumName) -or $sumName -eq 'SHA256SUMS.txt') { throw 'SHA256SUMS.txt aponta para arquivo ausente ou inválido.' }
      $sums[$sumName] = $Matches[1].ToLowerInvariant()
    }
    if ($sums.Count -ne ($files.Count - 1)) { throw 'SHA256SUMS.txt não cobre exatamente todos os arquivos do pacote.' }
    foreach ($name in $files.Keys) {
      if ($name -eq 'SHA256SUMS.txt') { continue }
      $entryStream = $files[$name].Open()
      try { $actual = Get-StreamSha256 -Stream $entryStream } finally { $entryStream.Dispose() }
      if (-not $sums.ContainsKey($name) -or $actual -cne $sums[$name]) { throw "Hash interno inválido: $name" }
    }

    $loginMarkerFound = $false
    $documentMarkerFound = $false
    foreach ($name in $files.Keys) {
      if ($name -notmatch '^frontend/dist/.*\.(js|css|html)$') { continue }
      $content = Get-ZipEntryText -Entry $files[$name]
      if ($content.Contains($LoginMarker)) { $loginMarkerFound = $true }
      if ($content.Contains($DocumentMarker)) { $documentMarkerFound = $true }
    }
    if (-not $backendOnly -and (-not $loginMarkerFound -or -not $documentMarkerFound)) { throw 'Bundle do Frontend não contém os marcadores obrigatórios de homologação.' }

    [pscustomobject]@{
      Path = $resolvedPath
      Sha256 = $archiveHash
      SourceCommit = $ExpectedCommit
      BackendOnly = [bool]$backendOnly
      BackendVersion = [string]$manifest.backendVersion
      FrontendVersion = [string]$manifest.frontendVersion
      NodeVersion = [string]$manifest.nodeVersion
      BackendDependencies = $backendPackage.dependencies
      BackendPackage = $backendPackage
      CompleteRuntime = $completeRuntime
      Entries = @($files.Keys | Sort-Object)
    }
  } finally {
    if ($zip) { $zip.Dispose() }
    $archiveStream.Dispose()
  }
}

function Get-ArtifactMapping {
  param([Parameter(Mandatory = $true)][string]$Name, [Parameter(Mandatory = $true)][string]$InstallRoot, [Parameter(Mandatory = $true)][string]$StageRoot, [bool]$CompleteRuntime = $false)
  if ($CompleteRuntime -and $Name.StartsWith('backend/', [StringComparison]::Ordinal)) {
    return [pscustomobject]@{ Stage = Join-Path $StageRoot ($Name -replace '/', '\'); Target = Join-Path $InstallRoot ($Name -replace '/', '\'); StageRoot = Join-Path $StageRoot 'backend'; TargetRoot = Join-Path $InstallRoot 'backend' }
  }
  if ($Name.StartsWith('backend/dist/', [StringComparison]::Ordinal)) {
    $relative = $Name.Substring('backend/dist/'.Length)
    return [pscustomobject]@{ Stage = Join-Path (Join-Path $StageRoot 'backend\dist') ($relative -replace '/', '\'); Target = Join-Path (Join-Path $InstallRoot 'backend\dist') ($relative -replace '/', '\'); StageRoot = Join-Path $StageRoot 'backend\dist'; TargetRoot = Join-Path $InstallRoot 'backend\dist' }
  }
  if ($Name -ceq 'backend/package.json') {
    return [pscustomobject]@{ Stage = Join-Path $StageRoot 'backend\package.json'; Target = Join-Path $InstallRoot 'backend\package.json'; StageRoot = Join-Path $StageRoot 'backend'; TargetRoot = Join-Path $InstallRoot 'backend' }
  }
  if ($Name.StartsWith('frontend/dist/', [StringComparison]::Ordinal)) {
    $relative = $Name.Substring('frontend/dist/'.Length)
    return [pscustomobject]@{ Stage = Join-Path (Join-Path $StageRoot 'frontend\dist') ($relative -replace '/', '\'); Target = Join-Path (Join-Path $InstallRoot 'frontend\dist') ($relative -replace '/', '\'); StageRoot = Join-Path $StageRoot 'frontend\dist'; TargetRoot = Join-Path $InstallRoot 'frontend\dist' }
  }
  if ($Name -ceq 'frontend/build-info.json') {
    return [pscustomobject]@{ Stage = Join-Path $StageRoot 'frontend\build-info.json'; Target = Join-Path $InstallRoot 'frontend\build-info.json'; StageRoot = Join-Path $StageRoot 'frontend'; TargetRoot = Join-Path $InstallRoot 'frontend' }
  }
  throw 'Entrada não mapeada para os artefatos ativos.'
}

function Set-StageDirectoryAcl {
  param([string]$StageDirectory, [string]$TargetDirectory)
  if (Test-Path -LiteralPath $StageDirectory) { return }
  [void][System.IO.Directory]::CreateDirectory($StageDirectory)
  $source = $TargetDirectory
  while (-not (Test-Path -LiteralPath $source -PathType Container)) {
    $parent = Split-Path -Parent $source
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $source) { throw 'Não foi possível localizar ACL de origem para o staging.' }
    $source = $parent
  }
  Set-Acl -LiteralPath $StageDirectory -AclObject (Get-Acl -LiteralPath $source) -Confirm:$false
}

function Expand-ValidatedUpdatePackage {
  param(
    [Parameter(Mandatory = $true)][string]$ZipPath,
    [Parameter(Mandatory = $true)][string]$StageRoot,
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [Parameter(Mandatory = $true)][psobject]$PackageInfo,
    [scriptblock]$BeforeWrite
  )
  if (Test-Path -LiteralPath $StageRoot) { throw 'Diretório de staging já existe; não será sobrescrito.' }
  $archiveStream = New-Object System.IO.FileStream($ZipPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  $zip = $null
  try {
    $currentZipHash = Get-StreamSha256 -Stream $archiveStream
    if ($currentZipHash -cne $PackageInfo.Sha256) { throw 'O ZIP mudou após a pré-validação; staging cancelado.' }
    $archiveStream.Position = 0
    [void][System.IO.Directory]::CreateDirectory($StageRoot)
    $zip = New-Object System.IO.Compression.ZipArchive($archiveStream, [System.IO.Compression.ZipArchiveMode]::Read, $true)
    foreach ($entry in $zip.Entries) {
      if ($entry.FullName.EndsWith('/')) { continue }
      $name = $entry.FullName
      if ($name -eq 'release-manifest.json' -or $name -eq 'SHA256SUMS.txt') {
        $dest = Join-Path $StageRoot ($name -replace '/', '\')
        [void][System.IO.Directory]::CreateDirectory((Split-Path -Parent $dest))
        if ($BeforeWrite) { & $BeforeWrite $name }
        $sourceStream = $entry.Open()
        try {
          $destStream = New-Object System.IO.FileStream($dest, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
          try { $sourceStream.CopyTo($destStream) } finally { $destStream.Dispose() }
        } finally { $sourceStream.Dispose() }
        continue
      }
      $mapping = Get-ArtifactMapping -Name $name -InstallRoot $InstallRoot -StageRoot $StageRoot -CompleteRuntime $PackageInfo.CompleteRuntime
      $stageDirectory = Split-Path -Parent $mapping.Stage
      $targetDirectory = Split-Path -Parent $mapping.Target
      $relativeDirectories = @()
      $cursorStage = $stageDirectory
      $cursorTarget = $targetDirectory
      while (-not (Test-Path -LiteralPath $cursorStage)) {
        $relativeDirectories = @([pscustomobject]@{ Stage = $cursorStage; Target = $cursorTarget }) + $relativeDirectories
        $cursorStage = Split-Path -Parent $cursorStage
        $cursorTarget = Split-Path -Parent $cursorTarget
        if ([string]::IsNullOrWhiteSpace($cursorStage)) { throw 'Caminho de staging inválido.' }
      }
      foreach ($directory in $relativeDirectories) {
        Set-StageDirectoryAcl -StageDirectory $directory.Stage -TargetDirectory $directory.Target
      }
      if ($BeforeWrite) { & $BeforeWrite $name }
      $sourceStream = $entry.Open()
      try {
        $destStream = New-Object System.IO.FileStream($mapping.Stage, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        try { $sourceStream.CopyTo($destStream) } finally { $destStream.Dispose() }
      } finally { $sourceStream.Dispose() }
      if (Test-Path -LiteralPath $mapping.Target -PathType Leaf) {
        Set-Acl -LiteralPath $mapping.Stage -AclObject (Get-Acl -LiteralPath $mapping.Target) -Confirm:$false
      }
    }
  } catch {
    # Preserve partial staging for diagnosis. Only the successful apply path removes its own stage.
    throw
  } finally {
    if ($zip) { $zip.Dispose() }
    $archiveStream.Dispose()
  }
}

function Test-LocalServiceReadExecute {
  param([Parameter(Mandatory = $true)][string]$Path)
  $sid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-19')
  $acl = Get-Acl -LiteralPath $Path
  $allowMask = 0
  $denyMask = 0
  $denySids = @('S-1-5-19', 'S-1-1-0', 'S-1-5-11', 'S-1-5-6', 'S-1-5-32-545')
  foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    $rights = [int]$rule.FileSystemRights
    if ($rule.IdentityReference.Value -ceq $sid.Value -and $rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow) {
      if (($rule.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly) -eq 0) { $allowMask = $allowMask -bor $rights }
    }
    if ($denySids -contains $rule.IdentityReference.Value -and $rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Deny) {
      if (($rule.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly) -eq 0) { $denyMask = $denyMask -bor $rights }
    }
  }
  $required = [int][System.Security.AccessControl.FileSystemRights]::ReadAndExecute
  if (($allowMask -band $required) -ne $required -or ($denyMask -band $required) -ne 0) {
    throw "LocalService não possui leitura e execução seguras em: $Path"
  }
}

function Assert-HomologationEnvironmentFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $values = @{}
  $critical = @('GOS_DEPLOYMENT_ENV', 'GOS_DATABASE_TARGET', 'GOS_EXTERNAL_EFFECTS_ENABLED', 'DATABASE_URL', 'PORT')
  foreach ($line in [IO.File]::ReadAllLines($Path)) {
    if ($line -match '^\s*(#|$)') { continue }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') { continue }
    $key = $Matches[1]
    if ($critical -notcontains $key) { continue }
    if ($values.ContainsKey($key)) { throw 'Arquivo .env.homologation possui chave de destino duplicada.' }
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$key] = $value
  }
  foreach ($key in $critical) {
    if (-not $values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($values[$key])) {
      throw 'Arquivo .env.homologation não declara todas as configurações de homologação obrigatórias.'
    }
  }
  if ($values['GOS_DEPLOYMENT_ENV'] -cne 'homologation' -or $values['GOS_DATABASE_TARGET'] -cne 'gestor_os_homologation' -or
      $values['GOS_EXTERNAL_EFFECTS_ENABLED'] -cne 'false' -or $values['PORT'] -cne '3100') {
    throw 'Arquivo .env.homologation não aponta para a configuração isolada aprovada.'
  }
  try {
    $uri = New-Object System.Uri($values['DATABASE_URL'])
    if ($uri.Scheme -cne 'mysql') { throw 'invalid' }
    $databaseName = [System.Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
    $userInfo = $uri.UserInfo
    $separatorIndex = $userInfo.IndexOf(':')
    $encodedUser = if ($separatorIndex -ge 0) { $userInfo.Substring(0, $separatorIndex) } else { $userInfo }
    $databaseUser = [System.Uri]::UnescapeDataString($encodedUser)
    if ($separatorIndex -lt 0 -or $separatorIndex -eq ($userInfo.Length - 1)) { throw 'invalid' }
    $databaseHost = $uri.Host.ToLowerInvariant() -replace '^\[|\]$', ''
    $databasePort = if ($uri.IsDefaultPort) { 3306 } else { $uri.Port }
    if ($databaseName -cne 'gestor_os_homologation' -or $databaseUser -cne 'gos_homologation_app' -or
        $databaseHost -notin @('localhost', '127.0.0.1', '::1') -or $databasePort -ne 3306) {
      throw 'invalid'
    }
  } catch {
    throw 'DATABASE_URL de homologação inválida; credenciais e detalhes foram omitidos.'
  }
}

function Assert-UpdateDestination {
  param([Parameter(Mandatory = $true)][string]$InstallRoot, [Parameter(Mandatory = $true)][psobject]$PackageInfo)
  if ([System.IO.Path]::GetFullPath($InstallRoot) -cne [System.IO.Path]::GetFullPath($script:ExpectedInstallRoot)) {
    throw 'Destino recusado: somente a instalação homologation aprovada é permitida.'
  }
  foreach ($path in @(
    $InstallRoot, (Join-Path $InstallRoot 'backend'), (Join-Path $InstallRoot 'backend\dist'),
    (Join-Path $InstallRoot 'backend\package.json'), (Join-Path $InstallRoot 'backend\node_modules'),
    (Join-Path $InstallRoot 'frontend'), (Join-Path $InstallRoot 'frontend\dist'),
    (Join-Path $InstallRoot 'frontend\build-info.json'), (Join-Path $InstallRoot 'config'),
    (Join-Path $InstallRoot 'config\.env.homologation'), (Join-Path $InstallRoot 'config\Caddyfile')
  )) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Destino incompleto; caminho obrigatório ausente: $path" }
    Assert-NoReparseChain -Path $path
  }
  Assert-HomologationEnvironmentFile -Path (Join-Path $InstallRoot 'config\.env.homologation')
  if ([System.IO.Path]::GetPathRoot($InstallRoot) -cne [System.IO.Path]::GetPathRoot((Join-Path $InstallRoot 'updates'))) {
    throw 'Staging e destinos precisam permanecer na mesma unidade.'
  }
  $nodePath = 'C:\Program Files\nodejs\node.exe'
  if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js do serviço não foi encontrado no caminho instalado.' }
  # Wait for the native process before selecting output; -First can stop it early in PowerShell 5.1.
  $nodeVersionOutput = @(& $nodePath --version 2>$null)
  $nodeExitCode = $LASTEXITCODE
  $nodeVersion = $nodeVersionOutput | Select-Object -First 1
  if ($nodeExitCode -ne 0 -or $nodeVersion -notmatch '^v24\.') { throw 'Node.js instalado não é compatível com a versão 24 exigida.' }
  $installedPackage = Get-Content -LiteralPath (Join-Path $InstallRoot 'backend\package.json') -Raw | ConvertFrom-Json -ErrorAction Stop
  [void](Assert-DependencyUpdateContract -InstalledPackage $installedPackage -PackageInfo $PackageInfo)
  if ($PackageInfo.CompleteRuntime) {
    foreach ($item in Get-ChildItem -LiteralPath (Join-Path $InstallRoot 'backend') -Force) {
      if ($item.Name -cnotin @('dist', 'node_modules', 'package.json', 'package-lock.json', 'runtime-info.json', 'release')) {
        throw 'Backend ativo contém arquivo/pasta fora do runtime; revise sua preservação antes da troca integral.'
      }
    }
  } else {
   foreach ($dependency in $PackageInfo.BackendDependencies.PSObject.Properties) {
    $relativePackage = 'node_modules\' + ($dependency.Name -replace '/', '\') + '\package.json'
    $dependencyPackagePath = Join-Path (Join-Path $InstallRoot 'backend') $relativePackage
    if (-not (Test-Path -LiteralPath $dependencyPackagePath)) {
      throw "Dependência de runtime ausente; atualização recusada: $($dependency.Name)"
    }
    $installedDependency = Get-Content -LiteralPath $dependencyPackagePath -Raw | ConvertFrom-Json -ErrorAction Stop
    if (-not (Test-SemVerRequirement -Required ([string]$dependency.Value) -Actual ([string]$installedDependency.version))) {
      throw "Versão instalada incompatível com a dependência declarada: $($dependency.Name)"
    }
   }
  }

  $serviceRows = @(Get-CimInstance Win32_Service | Where-Object Name -in $script:ExpectedServices)
  if ($serviceRows.Count -ne 2) { throw 'Os dois serviços de homologação precisam estar registrados.' }
  foreach ($serviceName in $script:ExpectedServices) {
    $service = $serviceRows | Where-Object Name -eq $serviceName | Select-Object -First 1
    if ($service.StartName -cne 'NT AUTHORITY\LocalService' -or $service.State -cne 'Running' -or $service.StartMode -cne 'Auto') {
      throw "Serviço $serviceName não está em execução automática sob LocalService."
    }
    $expectedExe = if ($serviceName -eq 'GestorOSBackendHomologation') { 'C:\Program Files\GestorOS\GestorOSBackend.exe' } else { 'C:\Program Files\GestorOS\GestorOSCaddy.exe' }
    if ($service.PathName -notmatch ('^\s*"' + [regex]::Escape($expectedExe) + '"')) { throw "Executável inesperado registrado para $serviceName." }
  }
  foreach ($target in @((Join-Path $InstallRoot 'backend'), (Join-Path $InstallRoot 'frontend\dist'), (Join-Path $InstallRoot 'backend\node_modules'))) {
    Test-LocalServiceReadExecute -Path $target
  }
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($null -eq $curl) { throw 'curl.exe não está disponível para validação HTTP local com certificado verificado.' }
}

function Assert-NoReparseChain {
  param([Parameter(Mandatory = $true)][string]$Path)
  $cursor = [System.IO.Path]::GetFullPath($Path)
  while (-not [string]::IsNullOrWhiteSpace($cursor)) {
    if (Test-Path -LiteralPath $cursor) {
      if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw 'Destino recusado: reparse point não é permitido em caminho operacional.'
      }
    }
    $parent = Split-Path -Parent $cursor
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $cursor) { break }
    $cursor = $parent
  }
}

function New-ExclusiveUpdateDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (Test-Path -LiteralPath $Path) { throw 'O diretório de atualização já existe; nenhum backup será sobrescrito.' }
  [void][System.IO.Directory]::CreateDirectory($Path)
  return $Path
}

function Open-ExclusiveUpdateLock {
  param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$UpdateId)
  $stream = New-Object System.IO.FileStream($Path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  try {
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($UpdateId)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
    return $stream
  } catch {
    $stream.Dispose()
    throw
  }
}

function Move-UpdateArtifact {
  param([Parameter(Mandatory = $true)][string]$Source, [Parameter(Mandatory = $true)][string]$Destination)
  if (-not (Test-Path -LiteralPath $Source)) { throw "Artefato de origem ausente: $Source" }
  if (Test-Path -LiteralPath $Destination) { throw "Destino já existe; operação recusada: $Destination" }
  $parent = Split-Path -Parent $Destination
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'Diretório pai do destino não existe.' }
  if ((Get-Item -LiteralPath $Source -Force).PSIsContainer) {
    [System.IO.Directory]::Move($Source, $Destination)
  } else {
    [System.IO.File]::Move($Source, $Destination)
  }
}

function Get-UpdateArtifactFingerprint {
  param([Parameter(Mandatory = $true)][string]$Path)
  Assert-NoReparseChain -Path $Path
  if (-not (Test-Path -LiteralPath $Path)) { return '' }
  $root = Get-Item -LiteralPath $Path -Force
  if (-not $root.PSIsContainer) { return ('file:' + (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()) }
  $records = New-Object System.Collections.Generic.List[string]
  $pending = New-Object System.Collections.Generic.Stack[string]
  $pending.Push($root.FullName)
  while ($pending.Count -gt 0) {
    foreach ($entry in Get-ChildItem -LiteralPath ($pending.Pop()) -Force) {
      if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Fingerprint recusado: artefato contém reparse point.' }
      $relative = $entry.FullName.Substring($root.FullName.TrimEnd('\').Length + 1)
      if ($entry.PSIsContainer) {
        $records.Add('dir:' + $relative)
        $pending.Push($entry.FullName)
      } else {
        $records.Add('file:' + $relative + ':' + (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant())
      }
    }
  }
  $ordered = $records.ToArray()
  [array]::Sort($ordered, [StringComparer]::Ordinal)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ('dir:' + ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($ordered -join "`n"))))).Replace('-', '').ToLowerInvariant()) }
  finally { $sha.Dispose() }
}

function Restore-UpdateArtifacts {
  param([object[]]$Items, [string]$JournalPath, [string]$SourceCommit, [hashtable]$Operations)
  $restoreItems = @($Items)
  [array]::Reverse($restoreItems)
  $errors = New-Object System.Collections.Generic.List[string]
  foreach ($item in $restoreItems) {
    try {
      if ([string]::IsNullOrWhiteSpace($item.OriginalFingerprint)) { throw 'Identidade anterior não registrada; exige inspeção manual.' }
      $activeFingerprint = Get-UpdateArtifactFingerprint -Path $item.TargetPath
      $backupFingerprint = Get-UpdateArtifactFingerprint -Path $item.BackupPath
      if ($activeFingerprint -ceq $item.OriginalFingerprint -and -not $item.NewActive -and
          (-not $item.OldMoved -or $backupFingerprint -ceq '')) {
        # Already restored (including a journal write interrupted after the rename), or never moved.
        if ($item.OldMoved) { $item.Restored = $true }
        $item.OldMoved = $false
        $item.NewActive = $false
        continue
      }
      if ($backupFingerprint -cne $item.OriginalFingerprint) { throw 'Backup anterior ausente ou divergente.' }
      if ($activeFingerprint -cne '' -and $activeFingerprint -cne $item.PreparedFingerprint) { throw 'Destino ativo ambíguo; não será movido.' }
      $item.OldMoved = $true
      Write-UpdateJournal -Path $JournalPath -Status ('restore-intent:' + $item.Name) -SourceCommit $SourceCommit -Items $Items -Message 'Restaurando artefato anterior verificado.'
      if ($activeFingerprint -cne '') {
        [void][IO.Directory]::CreateDirectory((Split-Path -Parent $item.FailedPath))
        & $Operations.MoveArtifact $item.TargetPath $item.FailedPath
        $item.NewActive = $false
        Write-UpdateJournal -Path $JournalPath -Status ('failed-new-preserved:' + $item.Name) -SourceCommit $SourceCommit -Items $Items -Message 'Artefato novo preservado.'
      }
      & $Operations.MoveArtifact $item.BackupPath $item.TargetPath
      $item.OldMoved = $false
      $item.NewActive = $false
      $item.Restored = $true
      if ((Get-UpdateArtifactFingerprint -Path $item.TargetPath) -cne $item.OriginalFingerprint) { throw 'Restauração não corresponde ao original.' }
      Write-UpdateJournal -Path $JournalPath -Status ('restored:' + $item.Name) -SourceCommit $SourceCommit -Items $Items -Message 'Artefato anterior restaurado e conferido.'
    } catch { $errors.Add('Falha ao restaurar o artefato ' + $item.Name + ': ' + $_.Exception.Message) }
  }
  if ($errors.Count -gt 0) { throw ($errors -join ' ') }
}

function Write-UpdateJournal {
  param([string]$Path, [string]$Status, [string]$SourceCommit, [object[]]$Items, [string]$Message, [psobject]$Recovery = $null)
  $journal = [ordered]@{
    application = 'Sistema Gestor OS'
    environment = 'homologation'
    sourceCommit = $(if ($SourceCommit.StartsWith('snapshot:', [StringComparison]::Ordinal)) { $null } else { $SourceCommit })
    releaseIdentity = $SourceCommit
    updatedAtUtc = [DateTime]::UtcNow.ToString('o')
    status = $Status
    message = $Message
    recovery = $Recovery
    artifacts = @($Items | ForEach-Object {
      [ordered]@{
        name = $_.Name
        target = $_.TargetPath
        backup = $_.BackupPath
        failedNew = $_.FailedPath
        previousMovedToBackup = [bool]$_.OldMoved
        newArtifactActive = [bool]$_.NewActive
        previousRestored = [bool]$_.Restored
        originalFingerprint = if ($_.PSObject.Properties['OriginalFingerprint']) { $_.OriginalFingerprint } else { $null }
        preparedFingerprint = if ($_.PSObject.Properties['PreparedFingerprint']) { $_.PreparedFingerprint } else { $null }
      }
    })
  }
  $temporary = $Path + '.tmp'
  $json = ConvertTo-Json -InputObject $journal -Depth 6
  [System.IO.File]::WriteAllText($temporary, $json, (New-Object System.Text.UTF8Encoding($false)))
  if (Test-Path -LiteralPath $Path) {
    $previous = $Path + '.' + [guid]::NewGuid().ToString('N') + '.previous'
    try { [System.IO.File]::Replace($temporary, $Path, $previous) } finally {
      if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Force -Confirm:$false -ErrorAction SilentlyContinue }
    }
  } else {
    [System.IO.File]::Move($temporary, $Path)
  }
}

function Invoke-ArtifactSwapTransaction {
  param(
    [Parameter(Mandatory = $true)][object[]]$Items,
    [Parameter(Mandatory = $true)][string]$JournalPath,
    [Parameter(Mandatory = $true)][string]$SourceCommit,
    [Parameter(Mandatory = $true)][hashtable]$Operations
  )
  $status = 'starting'
  $servicesStopRequested = $false
  $failurePhase = 'preparation'
  try {
    foreach ($item in $Items) {
      $original = Get-UpdateArtifactFingerprint -Path $item.TargetPath
      $prepared = Get-UpdateArtifactFingerprint -Path $item.PreparedPath
      if ($original -ceq '' -or $prepared -ceq '') { throw 'Artefato ativo ou preparado ausente antes da troca.' }
      $item | Add-Member -NotePropertyName OriginalFingerprint -NotePropertyValue $original -Force
      $item | Add-Member -NotePropertyName PreparedFingerprint -NotePropertyValue $prepared -Force
    }
    Write-UpdateJournal -Path $JournalPath -Status $status -SourceCommit $SourceCommit -Items $Items -Message 'Iniciando atualização controlada.'
    $servicesStopRequested = $true
    $failurePhase = 'stop-services'
    & $Operations.StopServices
    & $Operations.WaitServicesStopped
    $status = 'services-stopped'
    Write-UpdateJournal -Path $JournalPath -Status $status -SourceCommit $SourceCommit -Items $Items -Message 'Serviços parados e processos encerrados.'
    foreach ($item in $Items) {
      $failurePhase = 'backup-artifacts'
      Write-UpdateJournal -Path $JournalPath -Status ('backup-intent:' + $item.Name) -SourceCommit $SourceCommit -Items $Items -Message ('Preparando backup: ' + $item.Name)
      & $Operations.MoveArtifact $item.TargetPath $item.BackupPath
      $item.OldMoved = $true
      Write-UpdateJournal -Path $JournalPath -Status ('backup:' + $item.Name) -SourceCommit $SourceCommit -Items $Items -Message ('Versão anterior preservada: ' + $item.Name)
    }
    Write-UpdateJournal -Path $JournalPath -Status 'previous-version-backed-up' -SourceCommit $SourceCommit -Items $Items -Message 'Todos os artefatos anteriores estão preservados antes da ativação.'
    foreach ($item in $Items) {
      $failurePhase = 'activate-artifacts'
      Write-UpdateJournal -Path $JournalPath -Status ('activation-intent:' + $item.Name) -SourceCommit $SourceCommit -Items $Items -Message ('Preparando ativação: ' + $item.Name)
      & $Operations.MoveArtifact $item.PreparedPath $item.TargetPath
      $item.NewActive = $true
      Write-UpdateJournal -Path $JournalPath -Status ('active:' + $item.Name) -SourceCommit $SourceCommit -Items $Items -Message ('Novo artefato ativado: ' + $item.Name)
    }
    $failurePhase = 'validate-installed-artifacts'
    & $Operations.ValidateInstalledVersion
    $failurePhase = 'restart-services'
    & $Operations.StartServices
    & $Operations.WaitServicesRunning
    $failurePhase = 'validate-https'
    & $Operations.ValidateHttp
    $failurePhase = 'finalize-journal'
    Write-UpdateJournal -Path $JournalPath -Status 'success' -SourceCommit $SourceCommit -Items $Items -Message 'Artefatos instalados e verificações locais aprovadas.'
    return [pscustomobject]@{ Success = $true; RollbackSucceeded = $false; JournalPath = $JournalPath }
  } catch {
    $failureMessage = $_.Exception.Message
    if (-not $servicesStopRequested) {
      Write-UpdateJournal -Path $JournalPath -Status 'preparation-failed' -SourceCommit $SourceCommit -Items $Items -Message 'Pré-condições da troca não foram concluídas; nenhum serviço ou artefato ativo foi alterado.'
      throw ('Preparação da troca falhou antes de parar serviços. Motivo: ' + $failureMessage)
    }
    $movementObserved = @($Items | Where-Object { $_.OldMoved -or $_.NewActive }).Count -gt 0
    try {
      foreach ($item in $Items) {
        if (-not $item.PSObject.Properties['OriginalFingerprint']) { throw 'Identidade anterior não foi registrada.' }
        if ((Get-UpdateArtifactFingerprint -Path $item.TargetPath) -cne $item.OriginalFingerprint) { $movementObserved = $true }
      }
    } catch {
      Write-UpdateJournal -Path $JournalPath -Status 'recovery-required' -SourceCommit $SourceCommit -Items $Items -Message 'Não foi possível comprovar a identidade dos artefatos; exige inspeção manual.'
      throw 'RECUPERAÇÃO NÃO COMPROVADA. Preserve journal, staging e backup; nenhuma recuperação deve ser presumida.'
    }
    $recovery = [pscustomobject]@{
      artifactRestorationRequired = $movementObserved
      artifactsVerified = $false
      servicesVerified = $false
      httpsVerified = $false
      failurePhase = $null
      failureMessage = $null
      originalFailurePhase = $failurePhase
      originalFailureMessage = $failureMessage
    }
    if (-not $movementObserved) {
      $recovery.artifactsVerified = $true
      $recovery.failurePhase = 'restart-services'
      try {
        if ($servicesStopRequested) {
          & $Operations.StartServices
          & $Operations.WaitServicesRunning
          $recovery.servicesVerified = $true
          $recovery.failurePhase = 'validate-https'
          & $Operations.ValidateHttp
          $recovery.httpsVerified = $true
        }
      } catch {
        $recovery.failureMessage = $_.Exception.Message
        $recoveryStatus = if ($recovery.failurePhase -ceq 'validate-https') { 'pre-activation-https-validation-failed' } else { 'pre-activation-service-restart-failed' }
        Write-UpdateJournal -Path $JournalPath -Status $recoveryStatus -SourceCommit $SourceCommit -Items $Items -Recovery $recovery -Message ('Artefatos originais intactos; falha em ' + $recovery.failurePhase + ': ' + $recovery.failureMessage + ' Falha original: ' + $failureMessage)
        throw ('RECUPERAÇÃO INCOMPLETA ANTES DA ATIVAÇÃO. Falha em ' + $recovery.failurePhase + '. Nenhum arquivo foi trocado; recuperação não comprovada. ' + $recovery.failureMessage)
      }
      $recovery.failurePhase = $null
      Write-UpdateJournal -Path $JournalPath -Status 'failed-before-activation-recovered' -SourceCommit $SourceCommit -Items $Items -Recovery $recovery -Message ('Falha anterior à troca; originais conferidos e disponibilidade validada. Falha original: ' + $failureMessage)
      throw ('Atualização falhou antes de mover artefatos; versão anterior validada, sem rollback de arquivos. Motivo: ' + $failureMessage)
    }
    $rollbackErrors = New-Object System.Collections.Generic.List[string]
    $recovery.failurePhase = 'stop-services'
    try { & $Operations.StopServices } catch { $rollbackErrors.Add('Falha ao parar serviços durante rollback: ' + $_.Exception.Message) }
    if ($rollbackErrors.Count -eq 0) {
      try { & $Operations.WaitServicesStopped } catch { $rollbackErrors.Add('Serviços/processos não encerraram para rollback: ' + $_.Exception.Message) }
    }
    if ($rollbackErrors.Count -eq 0) {
      $recovery.failurePhase = 'restore-artifacts'
      try {
        Restore-UpdateArtifacts -Items $Items -JournalPath $JournalPath -SourceCommit $SourceCommit -Operations $Operations
        $recovery.artifactsVerified = $true
      }
      catch { $rollbackErrors.Add($_.Exception.Message) }
    }
    if ($rollbackErrors.Count -eq 0) {
      $recovery.failurePhase = 'restart-services'
      try {
        & $Operations.StartServices
        & $Operations.WaitServicesRunning
        $recovery.servicesVerified = $true
      } catch { $rollbackErrors.Add('Versão anterior restaurada; falha ao reiniciar/verificar serviços: ' + $_.Exception.Message) }
    }
    if ($rollbackErrors.Count -eq 0) {
      $recovery.failurePhase = 'validate-https'
      try {
        & $Operations.ValidateHttp
        $recovery.httpsVerified = $true
      } catch { $rollbackErrors.Add('Arquivos restaurados e serviços em execução; falha na validação HTTPS: ' + $_.Exception.Message) }
    }
    if ($rollbackErrors.Count -eq 0) {
      $recovery.failurePhase = $null
      Write-UpdateJournal -Path $JournalPath -Status 'rolled-back' -SourceCommit $SourceCommit -Items $Items -Recovery $recovery -Message ('Atualização falhou; versão anterior restaurada e validada. Motivo: ' + $failureMessage)
      throw ('Atualização falhou; rollback concluído. Backup preservado em ' + (Split-Path -Parent $JournalPath) + '. Motivo: ' + $failureMessage)
    }
    $recovery.failureMessage = $rollbackErrors -join ' '
    $recoveryStatus = switch ($recovery.failurePhase) {
      'validate-https' { 'rollback-https-validation-failed' }
      'restart-services' { 'rollback-service-restart-failed' }
      default { 'rollback-incomplete' }
    }
    try {
      Write-UpdateJournal -Path $JournalPath -Status $recoveryStatus -SourceCommit $SourceCommit -Items $Items -Recovery $recovery -Message ($recovery.failureMessage + ' Falha original: ' + $failureMessage)
    } catch { }
    if ($recoveryStatus -ceq 'rollback-https-validation-failed') {
      throw ('RECUPERAÇÃO HTTPS NÃO VALIDADA. Arquivos anteriores restaurados e serviços em execução; preserve journal e backup. ' + $recovery.failureMessage + ' Falha original: ' + $failureMessage)
    }
    if ($recoveryStatus -ceq 'rollback-service-restart-failed') {
      throw ('RECUPERAÇÃO DOS SERVIÇOS INCOMPLETA. Arquivos anteriores restaurados; preserve journal e backup. ' + $recovery.failureMessage + ' Falha original: ' + $failureMessage)
    }
    throw ('ROLLBACK INCOMPLETO. Serviços podem permanecer parados. Não declare sucesso. Preserve o backup em ' + (Split-Path -Parent $JournalPath) + ' e faça recuperação manual. ' + ($rollbackErrors -join ' ') + ' Falha original: ' + $failureMessage)
  }
}

function Test-SemVerRequirement {
  param([Parameter(Mandatory = $true)][string]$Required, [Parameter(Mandatory = $true)][string]$Actual)
  if ($Actual -notmatch '^(\d+)\.(\d+)\.(\d+)$') { return $false }
  $actualParts = @([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
  if ($Required -notmatch '^(\^|~)?(\d+)\.(\d+)\.(\d+)$') { return $false }
  $operator = $Matches[1]
  $minimum = @([int]$Matches[2], [int]$Matches[3], [int]$Matches[4])
  if ($operator -eq '') { return ($actualParts -join '.') -ceq ($minimum -join '.') }
  $atLeastMinimum = ($actualParts[0] -gt $minimum[0]) -or
    ($actualParts[0] -eq $minimum[0] -and $actualParts[1] -gt $minimum[1]) -or
    ($actualParts[0] -eq $minimum[0] -and $actualParts[1] -eq $minimum[1] -and $actualParts[2] -ge $minimum[2])
  if (-not $atLeastMinimum) { return $false }
  if ($operator -eq '~') { return ($actualParts[0] -eq $minimum[0] -and $actualParts[1] -eq $minimum[1]) }
  if ($minimum[0] -gt 0) { return $actualParts[0] -eq $minimum[0] }
  if ($minimum[1] -gt 0) { return ($actualParts[0] -eq 0 -and $actualParts[1] -eq $minimum[1]) }
  return ($actualParts[0] -eq 0 -and $actualParts[1] -eq 0 -and $actualParts[2] -eq $minimum[2])
}

function Assert-InstalledReleaseArtifacts {
  param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [Parameter(Mandatory = $true)][psobject]$PackageInfo,
    [string]$LoginMarker = 'AMBIENTE DE HOMOLOGAÇÃO',
    [string]$DocumentMarker = 'DOCUMENTO DE TESTE — HOMOLOGAÇÃO'
  )
  try {
    $backendPackage = Get-Content -LiteralPath (Join-Path $InstallRoot 'backend\package.json') -Raw | ConvertFrom-Json -ErrorAction Stop
    $frontendInfo = Get-Content -LiteralPath (Join-Path $InstallRoot 'frontend\build-info.json') -Raw | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw 'Manifesto ou metadados instalados não puderam ser lidos; atualização recusada.'
  }
  if ($backendPackage.name -cne 'sistema-gestor-os-backend' -or $backendPackage.version -cne $PackageInfo.BackendVersion -or
      $frontendInfo.environment -cne 'homologation' -or
      ((-not ($PackageInfo.PSObject.Properties['BackendOnly'] -and $PackageInfo.BackendOnly)) -and
        ($frontendInfo.sourceCommit -cne $PackageInfo.SourceCommit -or $frontendInfo.frontendVersion -cne $PackageInfo.FrontendVersion)) -or
      $frontendInfo.homologationMarkerVerified -ne $true) {
    throw 'Manifesto ou versão instalada não corresponde ao pacote aprovado.'
  }
  foreach ($requiredPath in @(
    (Join-Path $InstallRoot 'backend\dist\main.js'),
    (Join-Path $InstallRoot 'backend\dist\scripts\bootstrap-admin.js'),
    (Join-Path $InstallRoot 'backend\dist\infrastructure\homologation-database-target.js'),
    (Join-Path $InstallRoot 'frontend\dist\index.html')
  )) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) { throw 'Arquivo obrigatório da versão instalada está ausente.' }
  }
  $loginMarkerFound = $false
  $documentMarkerFound = $false
  foreach ($file in Get-ChildItem -LiteralPath (Join-Path $InstallRoot 'frontend\dist') -File -Recurse) {
    if ($file.Extension -notin @('.js', '.css', '.html')) { continue }
    $content = [IO.File]::ReadAllText($file.FullName)
    if ($content.Contains($LoginMarker)) { $loginMarkerFound = $true }
    if ($content.Contains($DocumentMarker)) { $documentMarkerFound = $true }
  }
  if (-not $loginMarkerFound -or -not $documentMarkerFound) { throw 'Bundle instalado não contém os marcadores obrigatórios de homologação.' }
  if ($PackageInfo.CompleteRuntime) {
    $backendRoot = Join-Path $InstallRoot 'backend'
    $lock = Read-PackageLockJson -Text (Get-Content -LiteralPath (Join-Path $backendRoot 'package-lock.json') -Raw)
    Assert-LockMatchesPackage -Package $backendPackage -Lock $lock
    $runtimeInfo = Get-Content -LiteralPath (Join-Path $backendRoot 'runtime-info.json') -Raw | ConvertFrom-Json
    if ($PackageInfo.SourceCommit.StartsWith('snapshot:', [StringComparison]::Ordinal)) {
      if ($null -ne $runtimeInfo.sourceCommit -or $runtimeInfo.sourceSnapshotSha256 -cne $PackageInfo.SourceCommit.Substring(9)) { throw 'Snapshot instalado não corresponde ao aprovado.' }
    } elseif ($runtimeInfo.sourceCommit -cne $PackageInfo.SourceCommit) { throw 'Runtime instalado não corresponde ao commit aprovado.' }
    Invoke-OfflineRuntimeValidation -BackendRoot $backendRoot
  }
}

function Assert-Administrator {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'A aplicação efetiva exige PowerShell elevado como Administrador.' }
}

function Assert-HomologationHttps {
  param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9.-]*$')][string]$HostName,
    [string]$CurlPath = (Get-Command curl.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  )
  foreach ($endpoint in @(
    @{ Name = 'Frontend'; Path = '/'; Status = '200'; MediaType = 'text/html' },
    @{ Name = 'API protegida'; Path = '/api/v1/auth/me'; Status = '401'; MediaType = 'application/json' }
  )) {
    # Schannel may have no CRL distribution point for the Caddy local CA. Best effort
    # keeps chain/hostname validation and does not ignore a positively revoked certificate.
    # --disable must be first: a user curlrc must not inject insecure TLS options.
    $curlArguments = @('--disable', '--ssl-revoke-best-effort', '--silent', '--show-error',
      '--noproxy', '*', '--proto', '=https', '--connect-timeout', '5', '--max-time', '15',
      '--resolve', ($HostName + ':443:127.0.0.1'), '--output', 'NUL', '--write-out',
      '%{http_code}|%{content_type}', ('https://' + $HostName + $endpoint.Path))
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $CurlPath
    $start.Arguments = ($curlArguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    $exitCode = -1
    $output = ''
    $diagnostic = 'CURL_PROCESS_FAILURE'
    try {
      [void]$process.Start()
      $stdout = $process.StandardOutput.ReadToEndAsync()
      $stderr = $process.StandardError.ReadToEndAsync()
      if (-not $process.WaitForExit(20000)) {
        $process.Kill()
        $diagnostic = 'CURL_PROCESS_TIMEOUT'
      } else {
        $exitCode = $process.ExitCode
        $output = $stdout.Result.Trim()
        $errorText = $stderr.Result
        # Record only known diagnostic tokens, never raw stderr (which may contain secrets).
        if ($errorText -match '\b(CRYPT_E_NO_REVOCATION_CHECK|CRYPT_E_REVOCATION_OFFLINE|CRYPT_E_REVOKED|CERT_E_REVOKED|CERT_E_UNTRUSTEDROOT|CERT_E_CN_NO_MATCH|CERT_E_EXPIRED)\b') {
          $diagnostic = $Matches[1]
        } else { $diagnostic = 'CURL_EXIT_' + $exitCode }
      }
    } catch { $diagnostic = 'CURL_PROCESS_FAILURE' }
    finally { $process.Dispose() }
    $httpStatus = 'unknown'
    $mediaType = ''
    if ($output -match '^(\d{3})\|([^\r\n|]*)$') {
      $httpStatus = $Matches[1]
      $mediaType = $Matches[2].Split(';')[0].Trim().ToLowerInvariant()
    }
    if ($exitCode -ne 0 -or $httpStatus -cne $endpoint.Status -or $mediaType -cne $endpoint.MediaType) {
      $failureKind = if ($exitCode -in @(35, 51, 58, 60, 77, 82, 83, 90, 91)) { 'tls' } elseif ($exitCode -ne 0) { 'connection-or-curl' } else { 'http-response' }
      $exception = New-Object InvalidOperationException ($endpoint.Name + ': validação HTTPS falhou; curlExit=' + $exitCode + ', HTTP=' + $httpStatus + ', esperado=' + $endpoint.Status + ', diagnóstico=' + $diagnostic + '. Confiança TLS e identidade precisam permanecer válidas.')
      $exception.Data['FailureKind'] = $failureKind
      $exception.Data['CurlExitCode'] = $exitCode
      $exception.Data['HttpStatus'] = $httpStatus
      $exception.Data['DiagnosticCode'] = $diagnostic
      throw $exception
    }
  }
}

function New-ServiceOperations {
  param([string]$HostName, [string]$BackendService, [string]$CaddyService, [string]$InstallRoot, [psobject]$PackageInfo)
  $backendOnly = [bool]($PackageInfo.PSObject.Properties['BackendOnly'] -and $PackageInfo.BackendOnly)
  $serviceNames = if ($backendOnly) { @($BackendService) } else { @($BackendService, $CaddyService) }
  $stopNames = @($serviceNames); [array]::Reverse($stopNames)
  $stopPorts = if ($backendOnly) { @(3100) } else { @(3100, 443) }
  $loginMarker = $script:LoginMarker
  $documentMarker = $script:DocumentMarker
  # GetNewClosure creates a dynamic module; bind script-local functions before entering it.
  $moveArtifactCommand = Get-Command Move-UpdateArtifact -CommandType Function -ErrorAction Stop
  $validateInstalledCommand = Get-Command Assert-InstalledReleaseArtifacts -CommandType Function -ErrorAction Stop
  $validateHttpsCommand = Get-Command Assert-HomologationHttps -CommandType Function -ErrorAction Stop
  $operations = @{
    MoveArtifact = { param($Source, $Destination) & $moveArtifactCommand -Source $Source -Destination $Destination }
    StopServices = {
      foreach ($name in $stopNames) {
        $service = Get-Service -Name $name -ErrorAction Stop
        if ($service.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Stopped) {
          Stop-Service -Name $name -Confirm:$false -ErrorAction Stop
        }
      }
    }
    WaitServicesStopped = {
      foreach ($name in $serviceNames) {
        $service = Get-Service -Name $name -ErrorAction Stop
        $service.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds(45))
      }
      $deadline = [DateTime]::UtcNow.AddSeconds(15)
      do {
        $running = @(Get-CimInstance Win32_Service | Where-Object { $_.Name -in $serviceNames -and $_.ProcessId -ne 0 })
        if ($running.Count -eq 0) { break }
        Start-Sleep -Milliseconds 250
      } while ([DateTime]::UtcNow -lt $deadline)
      if ($running.Count -ne 0) { throw 'Processo WinSW ainda ativo após parar os serviços.' }
      foreach ($port in $stopPorts) {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        if ($listeners.Count -gt 0) { throw "A porta local $port continua ocupada após parar os serviços." }
      }
    }
    StartServices = {
      Start-Service -Name $BackendService -Confirm:$false -ErrorAction Stop
      $service = Get-Service -Name $BackendService
      $service.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(45))
      if (-not $backendOnly) { Start-Service -Name $CaddyService -Confirm:$false -ErrorAction Stop }
    }
    ValidateInstalledVersion = {
      & $validateInstalledCommand -InstallRoot $InstallRoot -PackageInfo $PackageInfo -LoginMarker $loginMarker -DocumentMarker $documentMarker
    }
    WaitServicesRunning = {
      foreach ($name in $serviceNames) {
        $service = Get-Service -Name $name -ErrorAction Stop
        $service.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(45))
      }
      foreach ($port in @(3100, 443)) {
        $deadline = [DateTime]::UtcNow.AddSeconds(30)
        do {
          $listener = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
          if ($listener.Count -gt 0) { break }
          Start-Sleep -Milliseconds 250
        } while ([DateTime]::UtcNow -lt $deadline)
        if ($listener.Count -eq 0) { throw "Porta $port não ficou disponível após iniciar os serviços." }
      }
    }
    ValidateHttp = {
      & $validateHttpsCommand -HostName $HostName
    }
  }
  foreach ($operationName in @($operations.Keys)) {
    $operations[$operationName] = $operations[$operationName].GetNewClosure()
  }
  return $operations
}

function New-ReleaseArtifactItems {
  param([string]$InstallRoot, [string]$StageRoot, [string]$BackupRoot, [bool]$CompleteRuntime, [bool]$BackendOnly = $false)
  if ($BackendOnly -and -not $CompleteRuntime) { throw 'Backend isolado exige runtime completo.' }
  $names = if ($BackendOnly) { @('backend') } elseif ($CompleteRuntime) { @('backend', 'frontend/dist', 'frontend/build-info.json') } else { @('backend/dist', 'backend/package.json', 'frontend/dist', 'frontend/build-info.json') }
  foreach ($name in $names) {
    $relative = $name -replace '/', '\'
    [pscustomobject]@{ Name = $name; TargetPath = Join-Path $InstallRoot $relative; PreparedPath = Join-Path $StageRoot $relative;
      BackupPath = Join-Path $BackupRoot $relative; FailedPath = Join-Path (Join-Path $BackupRoot 'failed-new') $relative;
      OldMoved = $false; NewActive = $false; Restored = $false }
  }
}

function Invoke-HomologationUpdateApply {
  param([psobject]$PackageInfo, [string]$InstallRoot, [string]$ZipPath, [hashtable]$Operations)
  $updateId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [guid]::NewGuid().ToString('N')
  $updatesRoot = Join-Path $InstallRoot 'updates'
  if (-not (Test-Path -LiteralPath $updatesRoot)) { [void][System.IO.Directory]::CreateDirectory($updatesRoot) }
  if ((Get-Item -LiteralPath $updatesRoot -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Diretório de atualizações é um reparse point.' }
  $lockPath = Join-Path $updatesRoot 'artifact-update.lock'
  $lock = $null
  $stageRoot = Join-Path $updatesRoot ('stage-' + $updateId)
  $backupRoot = Join-Path $updatesRoot ('backup-' + $updateId)
  $completed = $false
  $transactionStarted = $false
  $journalPath = $null
  $items = @()
  $backendOnly = [bool]($PackageInfo.PSObject.Properties['BackendOnly'] -and $PackageInfo.BackendOnly)
  try {
    $lock = Open-ExclusiveUpdateLock -Path $lockPath -UpdateId $updateId
    if ([System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($InstallRoot)) -cne [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($updatesRoot))) { throw 'Staging e instalação não estão no mesmo volume.' }

    Assert-UpdateDestination -InstallRoot $InstallRoot -PackageInfo $PackageInfo
    $backupRoot = New-ExclusiveUpdateDirectory -Path $backupRoot
    $backupParents = if ($backendOnly) { @() } elseif ($PackageInfo.CompleteRuntime) { @('frontend') } else { @('backend', 'frontend') }
    foreach ($relativeDirectory in $backupParents) {
      [void][System.IO.Directory]::CreateDirectory((Join-Path $backupRoot $relativeDirectory))
    }
    $items = @(New-ReleaseArtifactItems -InstallRoot $InstallRoot -StageRoot $stageRoot -BackupRoot $backupRoot -CompleteRuntime $PackageInfo.CompleteRuntime -BackendOnly $backendOnly)
    $journalPath = Join-Path $backupRoot 'journal.json'
    Write-UpdateJournal -Path $journalPath -Status 'preparing' -SourceCommit $PackageInfo.SourceCommit -Items $items -Message 'Preparando staging; serviços e artefatos ativos ainda não foram alterados.'
    Expand-ValidatedUpdatePackage -ZipPath $ZipPath -StageRoot $stageRoot -InstallRoot $InstallRoot -PackageInfo $PackageInfo
    foreach ($path in @(
      (Join-Path $stageRoot 'backend\dist'), (Join-Path $stageRoot 'backend\package.json'),
      (Join-Path $stageRoot 'frontend\dist'), (Join-Path $stageRoot 'frontend\build-info.json'),
      (Join-Path $stageRoot 'backend\dist\main.js'), (Join-Path $stageRoot 'backend\dist\scripts\bootstrap-admin.js')
    )) {
      if ($backendOnly -and $path.StartsWith((Join-Path $stageRoot 'frontend'), [StringComparison]::OrdinalIgnoreCase)) { continue }
      if (-not (Test-Path -LiteralPath $path)) { throw "Staging incompleto: $path" }
      Test-LocalServiceReadExecute -Path $path
    }
    foreach ($artifactRoot in @((Join-Path $stageRoot 'backend'), (Join-Path $stageRoot 'frontend'))) {
      if ($backendOnly -and $artifactRoot -eq (Join-Path $stageRoot 'frontend')) { continue }
      foreach ($entry in Get-ChildItem -LiteralPath $artifactRoot -Force -Recurse) {
        Test-LocalServiceReadExecute -Path $entry.FullName
      }
    }
    $oldPackage = Get-Content -LiteralPath (Join-Path $InstallRoot 'backend\package.json') -Raw | ConvertFrom-Json -ErrorAction Stop
    [void](Assert-DependencyUpdateContract -InstalledPackage $oldPackage -PackageInfo $PackageInfo)
    if ($PackageInfo.CompleteRuntime) { Invoke-OfflineRuntimeValidation -BackendRoot (Join-Path $stageRoot 'backend') }
    if ($items | Where-Object { -not (Test-Path -LiteralPath $_.TargetPath) -or -not (Test-Path -LiteralPath $_.PreparedPath) }) { throw 'Um artefato ativo ou preparado está ausente.' }
    $transactionStarted = $true
    [void](Invoke-ArtifactSwapTransaction -Items $items -JournalPath $journalPath -SourceCommit $PackageInfo.SourceCommit -Operations $Operations)
    $completed = $true
    Write-Output ('Atualização concluída. Versão: ' + $PackageInfo.SourceCommit + '. Backup preservado: ' + $backupRoot)
    Write-Output 'A troca usou renomeações por componente e rollback coordenado; não é uma transação atômica entre todos os diretórios. Pacotes completos preservam também todo o node_modules anterior.'
  } catch {
    if (-not $transactionStarted -and $null -ne $journalPath) {
      Write-UpdateJournal -Path $journalPath -Status 'preparation-failed' -SourceCommit $PackageInfo.SourceCommit -Items $items -Message 'Preparação falhou; serviços e artefatos ativos não foram alterados. Preserve staging e backup para inspeção.'
    }
    throw
  } finally {
    if ($lock) {
      $lock.Dispose()
      if (Test-Path -LiteralPath $lockPath) { Remove-Item -LiteralPath $lockPath -Force -Confirm:$false -ErrorAction SilentlyContinue }
    }
    if ($completed -and (Test-Path -LiteralPath $stageRoot)) {
      Remove-Item -LiteralPath $stageRoot -Recurse -Force -Confirm:$false -ErrorAction SilentlyContinue
    }
  }
}

$installRoot = $script:ExpectedInstallRoot
$packageInfo = Get-ValidatedPackageInfo -Path $PackagePath -ExpectedSha256 $script:ExpectedPackageSha256 -ExpectedCommit $script:ExpectedSourceCommit -LoginMarker $script:LoginMarker -DocumentMarker $script:DocumentMarker
Assert-UpdateDestination -InstallRoot $installRoot -PackageInfo $packageInfo
Write-Output ('Pré-validação aprovada: homologation, origem ' + $packageInfo.SourceCommit + ', Backend ' + $packageInfo.BackendVersion + ', Frontend ' + $packageInfo.FrontendVersion + '.')
Write-Output 'Nenhuma conexão com banco foi aberta; configuração de destino, serviços e permissões foram verificados sem alterar arquivos persistentes.'

if (-not $Apply) {
  Write-Output 'Modo somente validação. Use -Apply -Confirm para solicitar a atualização.'
  return
}
if ($WhatIfPreference) {
  Write-Output 'WhatIf: nenhuma pasta temporária, journal ou lock foi criado; nenhum serviço, ACL, arquivo ativo ou banco foi alterado.'
  return
}
Assert-Administrator
if (-not $PSCmdlet.ShouldProcess($installRoot, ('Atualizar para a origem ' + $packageInfo.SourceCommit))) { return }
$operations = New-ServiceOperations -HostName $script:ExpectedHost -BackendService $script:ExpectedServices[0] -CaddyService $script:ExpectedServices[1] -InstallRoot $installRoot -PackageInfo $packageInfo
Invoke-HomologationUpdateApply -PackageInfo $packageInfo -InstallRoot $installRoot -ZipPath $packageInfo.Path -Operations $operations
