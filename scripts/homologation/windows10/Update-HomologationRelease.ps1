[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$PackagePath,
  [ValidatePattern('^[a-fA-F0-9]{64}$')]
  [string]$ExpectedPackageSha256 = 'e141f2ffe8af84f3c1cb3f46540af9e06a083c1b887a650485ee0425d52db7e6',
  [ValidatePattern('^[a-fA-F0-9]{40}$')]
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

  if ($ExpectedSha256 -notmatch '^[0-9a-fA-F]{64}$' -or $ExpectedCommit -notmatch '^[0-9a-fA-F]{40}$') {
    throw 'Hash ou commit esperado possui formato inválido.'
  }
  $resolvedPath = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
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
      'backend/dist/scripts/bootstrap-admin.js', 'backend/dist/infrastructure/homologation-database-target.js',
      'frontend/build-info.json', 'frontend/dist/index.html'
    )) {
      if (-not $files.ContainsKey($required)) { throw "Pacote incompleto: arquivo obrigatório ausente ($required)." }
    }

    $manifestText = Get-ZipEntryText -Entry $files['release-manifest.json']
    $manifest = $manifestText | ConvertFrom-Json -ErrorAction Stop
    $completeRuntime = $manifest.releaseType -ceq 'complete-runtime-update'
    $legacyRuntime = $manifest.releaseType -ceq 'artifact-update'
    if ($manifest.environment -cne 'homologation' -or (-not $completeRuntime -and -not $legacyRuntime) -or
        $manifest.sourceCommit -cne $ExpectedCommit -or $manifest.nodeVersion -notmatch '^v24\.') {
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
    $buildInfo = (Get-ZipEntryText -Entry $files['frontend/build-info.json']) | ConvertFrom-Json -ErrorAction Stop
    if ($buildInfo.environment -cne 'homologation' -or $buildInfo.sourceCommit -cne $ExpectedCommit -or
        $buildInfo.frontendVersion -cne $manifest.frontendVersion -or $buildInfo.homologationMarkerVerified -ne $true) {
      throw 'Manifesto do Frontend incompatível com a versão aprovada.'
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
      if ($lockHash -cne $manifest.lockSha256 -or $runtimeInfo.lockSha256 -cne $lockHash -or
          $runtimeInfo.sourceCommit -cne $ExpectedCommit -or $runtimeInfo.platform -cne 'win32' -or $runtimeInfo.arch -cne 'x64' -or
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
    if (-not $loginMarkerFound -or -not $documentMarkerFound) { throw 'Bundle do Frontend não contém os marcadores obrigatórios de homologação.' }

    [pscustomobject]@{
      Path = $resolvedPath
      Sha256 = $archiveHash
      SourceCommit = [string]$manifest.sourceCommit
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
  Set-Acl -LiteralPath $StageDirectory -AclObject (Get-Acl -LiteralPath $source)
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
        Set-Acl -LiteralPath $mapping.Stage -AclObject (Get-Acl -LiteralPath $mapping.Target)
      }
    }
  } catch {
    if (Test-Path -LiteralPath $StageRoot) { Remove-Item -LiteralPath $StageRoot -Recurse -Force -ErrorAction SilentlyContinue }
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
  $nodeVersion = (& $nodePath --version 2>$null | Select-Object -First 1)
  if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24\.') { throw 'Node.js instalado não é compatível com a versão 24 exigida.' }
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

function Write-UpdateJournal {
  param([string]$Path, [string]$Status, [string]$SourceCommit, [object[]]$Items, [string]$Message)
  $journal = [ordered]@{
    application = 'Sistema Gestor OS'
    environment = 'homologation'
    sourceCommit = $SourceCommit
    updatedAtUtc = [DateTime]::UtcNow.ToString('o')
    status = $Status
    message = $Message
    artifacts = @($Items | ForEach-Object {
      [ordered]@{
        name = $_.Name
        target = $_.TargetPath
        backup = $_.BackupPath
        failedNew = $_.FailedPath
        previousMovedToBackup = [bool]$_.OldMoved
        newArtifactActive = [bool]$_.NewActive
        previousRestored = [bool]$_.Restored
      }
    })
  }
  $temporary = $Path + '.tmp'
  $json = ConvertTo-Json -InputObject $journal -Depth 6
  [System.IO.File]::WriteAllText($temporary, $json, (New-Object System.Text.UTF8Encoding($false)))
  if (Test-Path -LiteralPath $Path) {
    $previous = $Path + '.' + [guid]::NewGuid().ToString('N') + '.previous'
    try { [System.IO.File]::Replace($temporary, $Path, $previous) } finally {
      if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Force -ErrorAction SilentlyContinue }
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
  try {
    Write-UpdateJournal -Path $JournalPath -Status $status -SourceCommit $SourceCommit -Items $Items -Message 'Iniciando atualização controlada.'
    & $Operations.StopServices
    & $Operations.WaitServicesStopped
    $status = 'services-stopped'
    Write-UpdateJournal -Path $JournalPath -Status $status -SourceCommit $SourceCommit -Items $Items -Message 'Serviços parados e processos encerrados.'
    foreach ($item in $Items) {
      Write-UpdateJournal -Path $JournalPath -Status ('backup-intent:' + $item.Name) -SourceCommit $SourceCommit -Items $Items -Message ('Preparando backup: ' + $item.Name)
      & $Operations.MoveArtifact $item.TargetPath $item.BackupPath
      $item.OldMoved = $true
      Write-UpdateJournal -Path $JournalPath -Status ('backup:' + $item.Name) -SourceCommit $SourceCommit -Items $Items -Message ('Versão anterior preservada: ' + $item.Name)
    }
    Write-UpdateJournal -Path $JournalPath -Status 'previous-version-backed-up' -SourceCommit $SourceCommit -Items $Items -Message 'Todos os artefatos anteriores estão preservados antes da ativação.'
    foreach ($item in $Items) {
      Write-UpdateJournal -Path $JournalPath -Status ('activation-intent:' + $item.Name) -SourceCommit $SourceCommit -Items $Items -Message ('Preparando ativação: ' + $item.Name)
      & $Operations.MoveArtifact $item.PreparedPath $item.TargetPath
      $item.NewActive = $true
      Write-UpdateJournal -Path $JournalPath -Status ('active:' + $item.Name) -SourceCommit $SourceCommit -Items $Items -Message ('Novo artefato ativado: ' + $item.Name)
    }
    & $Operations.ValidateInstalledVersion
    & $Operations.StartServices
    & $Operations.WaitServicesRunning
    & $Operations.ValidateHttp
    Write-UpdateJournal -Path $JournalPath -Status 'success' -SourceCommit $SourceCommit -Items $Items -Message 'Artefatos instalados e verificações locais aprovadas.'
    return [pscustomobject]@{ Success = $true; RollbackSucceeded = $false; JournalPath = $JournalPath }
  } catch {
    $failureMessage = $_.Exception.Message
    $rollbackErrors = New-Object System.Collections.Generic.List[string]
    try { & $Operations.StopServices } catch { $rollbackErrors.Add('Falha ao parar serviços durante rollback.') }
    if ($rollbackErrors.Count -eq 0) {
      try { & $Operations.WaitServicesStopped } catch { $rollbackErrors.Add('Serviços/processos não encerraram para rollback.') }
    }
    if ($rollbackErrors.Count -eq 0) {
      $rollbackItems = @($Items)
      [array]::Reverse($rollbackItems)
      foreach ($item in $rollbackItems) {
        try {
          if ($item.OldMoved) {
            Write-UpdateJournal -Path $JournalPath -Status ('restore-intent:' + $item.Name) -SourceCommit $SourceCommit -Items $Items -Message ('Restaurando versão anterior: ' + $item.Name)
          }
          if ($item.OldMoved -and (Test-Path -LiteralPath $item.TargetPath)) {
            [void][System.IO.Directory]::CreateDirectory((Split-Path -Parent $item.FailedPath))
            & $Operations.MoveArtifact $item.TargetPath $item.FailedPath
            $item.NewActive = $false
            Write-UpdateJournal -Path $JournalPath -Status ('failed-new-preserved:' + $item.Name) -SourceCommit $SourceCommit -Items $Items -Message ('Artefato novo preservado para diagnóstico: ' + $item.Name)
          }
          if ($item.OldMoved -and (Test-Path -LiteralPath $item.BackupPath)) {
            & $Operations.MoveArtifact $item.BackupPath $item.TargetPath
            $item.OldMoved = $false
            $item.NewActive = $false
            $item.Restored = $true
          } elseif ($item.OldMoved -or -not (Test-Path -LiteralPath $item.TargetPath)) {
            throw 'Versão anterior ausente no destino e no backup.'
          }
          if ($item.Restored) {
            Write-UpdateJournal -Path $JournalPath -Status ('restored:' + $item.Name) -SourceCommit $SourceCommit -Items $Items -Message ('Versão anterior restaurada: ' + $item.Name)
          }
        } catch { $rollbackErrors.Add('Falha ao restaurar o artefato ' + $item.Name + '.') }
      }
    }
    if ($rollbackErrors.Count -eq 0) {
      try {
        & $Operations.StartServices
        & $Operations.WaitServicesRunning
        & $Operations.ValidateHttp
      } catch { $rollbackErrors.Add('A versão anterior foi reposta, mas não passou na validação de recuperação.') }
    }
    if ($rollbackErrors.Count -eq 0) {
      Write-UpdateJournal -Path $JournalPath -Status 'rolled-back' -SourceCommit $SourceCommit -Items $Items -Message ('Atualização falhou; versão anterior restaurada e validada. Motivo: ' + $failureMessage)
      throw ('Atualização falhou; rollback concluído. Backup preservado em ' + (Split-Path -Parent $JournalPath) + '. Motivo: ' + $failureMessage)
    }
    try {
      Write-UpdateJournal -Path $JournalPath -Status 'rollback-incomplete' -SourceCommit $SourceCommit -Items $Items -Message ('ROLLBACK INCOMPLETO: ' + ($rollbackErrors -join ' ') + ' Falha original: ' + $failureMessage)
    } catch { }
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
      $frontendInfo.environment -cne 'homologation' -or $frontendInfo.sourceCommit -cne $PackageInfo.SourceCommit -or
      $frontendInfo.frontendVersion -cne $PackageInfo.FrontendVersion -or $frontendInfo.homologationMarkerVerified -ne $true) {
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
    if ($runtimeInfo.sourceCommit -cne $PackageInfo.SourceCommit) { throw 'Runtime instalado não corresponde ao commit aprovado.' }
    Invoke-OfflineRuntimeValidation -BackendRoot $backendRoot
  }
}

function Assert-Administrator {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'A aplicação efetiva exige PowerShell elevado como Administrador.' }
}

function New-ServiceOperations {
  param([string]$HostName, [string]$BackendService, [string]$CaddyService, [string]$InstallRoot, [psobject]$PackageInfo)
  $serviceNames = @($BackendService, $CaddyService)
  $loginMarker = $script:LoginMarker
  $documentMarker = $script:DocumentMarker
  $operations = @{
    MoveArtifact = { param($Source, $Destination) Move-UpdateArtifact -Source $Source -Destination $Destination }
    StopServices = {
      foreach ($name in @($CaddyService, $BackendService)) {
        $service = Get-Service -Name $name -ErrorAction Stop
        if ($service.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Stopped) {
          Stop-Service -Name $name -ErrorAction Stop
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
      foreach ($port in @(3100, 443)) {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        if ($listeners.Count -gt 0) { throw "A porta local $port continua ocupada após parar os serviços." }
      }
    }
    StartServices = {
      Start-Service -Name $BackendService -ErrorAction Stop
      $service = Get-Service -Name $BackendService
      $service.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(45))
      Start-Service -Name $CaddyService -ErrorAction Stop
    }
    ValidateInstalledVersion = {
      Assert-InstalledReleaseArtifacts -InstallRoot $InstallRoot -PackageInfo $PackageInfo -LoginMarker $loginMarker -DocumentMarker $documentMarker
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
      $curl = (Get-Command curl.exe -ErrorAction Stop).Source
      $frontendUrl = 'https://' + $HostName + '/'
      $apiUrl = 'https://' + $HostName + '/api/v1/auth/me'
      $frontendResult = & $curl --silent --show-error --noproxy '*' --connect-timeout 5 --max-time 15 --resolve ($HostName + ':443:127.0.0.1') --output 'NUL' --write-out '%{http_code}|%{content_type}' $frontendUrl 2>$null
      if ($LASTEXITCODE -ne 0 -or (($frontendResult -join '') -notmatch '^200\|text/html')) { throw 'Frontend não retornou HTTP 200 HTML pelo HTTPS local.' }
      $apiResult = & $curl --silent --show-error --noproxy '*' --connect-timeout 5 --max-time 15 --resolve ($HostName + ':443:127.0.0.1') --output 'NUL' --write-out '%{http_code}|%{content_type}' $apiUrl 2>$null
      if ($LASTEXITCODE -ne 0 -or (($apiResult -join '') -notmatch '^401\|application/json')) { throw 'API protegida não retornou HTTP 401 JSON pelo HTTPS local.' }
    }
  }
  foreach ($operationName in @($operations.Keys)) {
    $operations[$operationName] = $operations[$operationName].GetNewClosure()
  }
  return $operations
}

function New-ReleaseArtifactItems {
  param([string]$InstallRoot, [string]$StageRoot, [string]$BackupRoot, [bool]$CompleteRuntime)
  $names = if ($CompleteRuntime) { @('backend', 'frontend/dist', 'frontend/build-info.json') } else { @('backend/dist', 'backend/package.json', 'frontend/dist', 'frontend/build-info.json') }
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
  $stageCreated = $false
  $rollbackIncomplete = $false
  try {
    $lock = Open-ExclusiveUpdateLock -Path $lockPath -UpdateId $updateId
    if ([System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($InstallRoot)) -cne [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($updatesRoot))) { throw 'Staging e instalação não estão no mesmo volume.' }

    Assert-UpdateDestination -InstallRoot $InstallRoot -PackageInfo $PackageInfo
    Expand-ValidatedUpdatePackage -ZipPath $ZipPath -StageRoot $stageRoot -InstallRoot $InstallRoot -PackageInfo $PackageInfo
    $stageCreated = $true
    foreach ($path in @(
      (Join-Path $stageRoot 'backend\dist'), (Join-Path $stageRoot 'backend\package.json'),
      (Join-Path $stageRoot 'frontend\dist'), (Join-Path $stageRoot 'frontend\build-info.json'),
      (Join-Path $stageRoot 'backend\dist\main.js'), (Join-Path $stageRoot 'backend\dist\scripts\bootstrap-admin.js')
    )) {
      if (-not (Test-Path -LiteralPath $path)) { throw "Staging incompleto: $path" }
      Test-LocalServiceReadExecute -Path $path
    }
    foreach ($artifactRoot in @((Join-Path $stageRoot 'backend'), (Join-Path $stageRoot 'frontend'))) {
      foreach ($entry in Get-ChildItem -LiteralPath $artifactRoot -Force -Recurse) {
        Test-LocalServiceReadExecute -Path $entry.FullName
      }
    }
    $oldPackage = Get-Content -LiteralPath (Join-Path $InstallRoot 'backend\package.json') -Raw | ConvertFrom-Json -ErrorAction Stop
    [void](Assert-DependencyUpdateContract -InstalledPackage $oldPackage -PackageInfo $PackageInfo)
    if ($PackageInfo.CompleteRuntime) { Invoke-OfflineRuntimeValidation -BackendRoot (Join-Path $stageRoot 'backend') }
    $backupRoot = New-ExclusiveUpdateDirectory -Path $backupRoot
    $backupParents = if ($PackageInfo.CompleteRuntime) { @('frontend') } else { @('backend', 'frontend') }
    foreach ($relativeDirectory in $backupParents) {
      [void][System.IO.Directory]::CreateDirectory((Join-Path $backupRoot $relativeDirectory))
    }
    $items = @(New-ReleaseArtifactItems -InstallRoot $InstallRoot -StageRoot $stageRoot -BackupRoot $backupRoot -CompleteRuntime $PackageInfo.CompleteRuntime)
    if ($items | Where-Object { -not (Test-Path -LiteralPath $_.TargetPath) -or -not (Test-Path -LiteralPath $_.PreparedPath) }) { throw 'Um artefato ativo ou preparado está ausente.' }
    $journalPath = Join-Path $backupRoot 'journal.json'
    try {
      [void](Invoke-ArtifactSwapTransaction -Items $items -JournalPath $journalPath -SourceCommit $PackageInfo.SourceCommit -Operations $Operations)
    } catch {
      if ($_.Exception.Message -like 'ROLLBACK INCOMPLETO*') { $rollbackIncomplete = $true }
      throw
    }
    Write-Output ('Atualização concluída. Versão: ' + $PackageInfo.SourceCommit + '. Backup preservado: ' + $backupRoot)
    Write-Output 'A troca usou renomeações por componente e rollback coordenado; não é uma transação atômica entre todos os diretórios. Pacotes completos preservam também todo o node_modules anterior.'
  } finally {
    if ($lock) {
      $lock.Dispose()
      if (Test-Path -LiteralPath $lockPath) { Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue }
    }
    if ($stageCreated -and -not $rollbackIncomplete -and (Test-Path -LiteralPath $stageRoot)) {
      Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

$installRoot = $script:ExpectedInstallRoot
$packageInfo = Get-ValidatedPackageInfo -Path $PackagePath -ExpectedSha256 $script:ExpectedPackageSha256 -ExpectedCommit $script:ExpectedSourceCommit -LoginMarker $script:LoginMarker -DocumentMarker $script:DocumentMarker
Assert-UpdateDestination -InstallRoot $installRoot -PackageInfo $packageInfo
Write-Output ('Pré-validação aprovada: homologation, commit ' + $packageInfo.SourceCommit + ', Backend ' + $packageInfo.BackendVersion + ', Frontend ' + $packageInfo.FrontendVersion + '.')
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
if (-not $PSCmdlet.ShouldProcess($installRoot, ('Atualizar para o commit ' + $packageInfo.SourceCommit))) { return }
$operations = New-ServiceOperations -HostName $script:ExpectedHost -BackendService $script:ExpectedServices[0] -CaddyService $script:ExpectedServices[1] -InstallRoot $installRoot -PackageInfo $packageInfo
Invoke-HomologationUpdateApply -PackageInfo $packageInfo -InstallRoot $installRoot -ZipPath $packageInfo.Path -Operations $operations
