[CmdletBinding()]
param([switch]$VerifyBrokenClosureRegression)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$updaterPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'Update-HomologationRelease.ps1'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($updaterPath, [ref]$tokens, [ref]$errors)
if (@($errors).Count -gt 0) { throw 'Updater rejected by PowerShell parser.' }
$definitions = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false) | ForEach-Object { $_.Extent.Text }) -join "`r`n"
if ($VerifyBrokenClosureRegression) {
  $fixedCall = '& $moveArtifactCommand -Source $Source -Destination $Destination'
  if (-not $definitions.Contains($fixedCall)) { throw 'Fixed production callback not found for regression sensitivity check.' }
  $definitions = $definitions.Replace($fixedCall, 'Move-UpdateArtifact -Source $Source -Destination $Destination')
}
$source = [IO.File]::ReadAllText($updaterPath)
$entrypoint = $source.Substring($source.LastIndexOf('$installRoot = $script:ExpectedInstallRoot', [StringComparison]::Ordinal))

# A private host accepts exactly the outer confirmation. No real service command is available
# to the test closures: Windows boundaries are replaced inside this isolated runspace only.
if (-not ('GestorOS.UpdateTestHost' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Globalization;
using System.Collections.ObjectModel;
using System.Collections.Generic;
using System.Security;
using System.Management.Automation;
using System.Management.Automation.Host;
namespace GestorOS {
  public sealed class UpdateTestUI : PSHostUserInterface {
    public int Confirmations;
    public override PSHostRawUserInterface RawUI { get { return null; } }
    public override string ReadLine() { throw new InvalidOperationException("Unexpected input"); }
    public override SecureString ReadLineAsSecureString() { throw new InvalidOperationException("Unexpected password input"); }
    public override Dictionary<string, PSObject> Prompt(string c, string m, Collection<FieldDescription> d) { throw new InvalidOperationException("Unexpected prompt"); }
    public override PSCredential PromptForCredential(string c, string m, string u, string t) { throw new InvalidOperationException("Unexpected credentials"); }
    public override PSCredential PromptForCredential(string c, string m, string u, string t, PSCredentialTypes a, PSCredentialUIOptions b) { throw new InvalidOperationException("Unexpected credentials"); }
    public override int PromptForChoice(string c, string m, Collection<ChoiceDescription> d, int v) { Confirmations++; return 0; }
    public override void Write(string v) {}
    public override void Write(ConsoleColor f, ConsoleColor b, string v) {}
    public override void WriteLine(string v) {}
    public override void WriteErrorLine(string v) {}
    public override void WriteDebugLine(string v) {}
    public override void WriteProgress(long s, ProgressRecord r) {}
    public override void WriteVerboseLine(string v) {}
    public override void WriteWarningLine(string v) {}
  }
  public sealed class UpdateTestHost : PSHost {
    public readonly UpdateTestUI TestUI = new UpdateTestUI();
    private readonly Guid id = Guid.NewGuid();
    public override Guid InstanceId { get { return id; } }
    public override string Name { get { return "GestorOS isolated updater test"; } }
    public override Version Version { get { return new Version(1,0); } }
    public override PSHostUserInterface UI { get { return TestUI; } }
    public override CultureInfo CurrentCulture { get { return CultureInfo.InvariantCulture; } }
    public override CultureInfo CurrentUICulture { get { return CultureInfo.InvariantCulture; } }
    public override void SetShouldExit(int c) {}
    public override void EnterNestedPrompt() { throw new InvalidOperationException("Unexpected nested prompt"); }
    public override void ExitNestedPrompt() {}
    public override void NotifyBeginApplication() {}
    public override void NotifyEndApplication() {}
  }
}
'@
}

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('GestorOS-RealScope-' + [guid]::NewGuid().ToString('N'))
$testHost = New-Object GestorOS.UpdateTestHost
$runspace = [Management.Automation.Runspaces.RunspaceFactory]::CreateRunspace($testHost)
$runspace.Open()
$engine = [Management.Automation.PowerShell]::Create()
$engine.Runspace = $runspace
$harness = @'
param($Definitions, $Root, $Entrypoint)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Match an invoked .ps1: helpers live in a child scope, not the global session.
& {
  Add-Type -AssemblyName System.ServiceProcess
  Invoke-Expression $Definitions
  $script:LoginMarker = 'AMBIENTE DE HOMOLOGAÇÃO'
  $script:DocumentMarker = 'DOCUMENTO DE TESTE — HOMOLOGAÇÃO'
  $commit = '1111111111111111111111111111111111111111'
  function Assert-Test { param([bool]$Condition, [string]$Message) if (-not $Condition) { throw $Message } }
  function Expect-Failure { param([scriptblock]$Action, [string]$Pattern)
    try { & $Action } catch { if ($_.Exception.Message -like $Pattern) { return }; throw }
    throw ('Missing expected failure: ' + $Pattern)
  }
  # Real production closures resolve only OS boundary fakes through the isolated global scope.
  $global:ServiceState = @{}
  $global:ServiceCalls = 0
  function global:Get-Service { param($Name)
    $service = [pscustomobject]@{ Name = $Name; Status = $global:ServiceState[$Name] }
    $service | Add-Member ScriptMethod WaitForStatus { param($Expected, $Timeout)
      if ($global:ServiceState[$this.Name] -ne $Expected) { throw 'Unexpected fake service status.' }
    }
    return $service
  }
  function global:Stop-Service {
    [CmdletBinding(SupportsShouldProcess=$true)] param($Name)
    if (-not $PSBoundParameters.ContainsKey('Confirm') -or $PSBoundParameters['Confirm']) { throw 'Internal stop must explicitly suppress a second confirmation.' }
    if ($PSCmdlet.ShouldProcess($Name, 'Stop fixture')) { $global:ServiceState[$Name] = [ServiceProcess.ServiceControllerStatus]::Stopped; $global:ServiceCalls++ }
  }
  function global:Start-Service {
    [CmdletBinding(SupportsShouldProcess=$true)] param($Name)
    if (-not $PSBoundParameters.ContainsKey('Confirm') -or $PSBoundParameters['Confirm']) { throw 'Internal start must explicitly suppress a second confirmation.' }
    if ($PSCmdlet.ShouldProcess($Name, 'Start fixture')) { $global:ServiceState[$Name] = [ServiceProcess.ServiceControllerStatus]::Running; $global:ServiceCalls++ }
  }
  function global:Get-CimInstance { param($ClassName) foreach ($name in @('fixture-backend','fixture-caddy')) { [pscustomobject]@{ Name = $name; ProcessId = 0 } } }
  function global:Get-NetTCPConnection { param($State, $LocalPort)
    $service = if ($LocalPort -eq 3100) { 'fixture-backend' } else { 'fixture-caddy' }
    if ($global:ServiceState[$service] -eq [ServiceProcess.ServiceControllerStatus]::Running) { [pscustomobject]@{ LocalPort = $LocalPort } }
  }
  function New-Case { param($Name)
    $base = Join-Path $Root $Name
    foreach ($relative in @('active/backend/dist/scripts', 'active/backend/dist/infrastructure', 'active/backend/node_modules/fixture', 'active/frontend/dist',
      'stage/backend/dist/scripts', 'stage/backend/dist/infrastructure', 'stage/backend/node_modules/fixture', 'stage/frontend/dist', 'backup/frontend')) {
      [void][IO.Directory]::CreateDirectory((Join-Path $base $relative))
    }
    foreach ($pair in @(@{ Name='active'; Version='7.10.0'; Label='old' }, @{ Name='stage'; Version='7.10.1'; Label='new' })) {
      $part = Join-Path $base $pair.Name
      [IO.File]::WriteAllText((Join-Path $part 'backend/node_modules/fixture/version'), $pair.Version)
      [IO.File]::WriteAllText((Join-Path $part 'backend/package-lock.json'), $pair.Version)
      [IO.File]::WriteAllText((Join-Path $part 'backend/package.json'), '{"name":"sistema-gestor-os-backend","version":"0.1.0"}')
      [IO.File]::WriteAllText((Join-Path $part 'backend/dist/main.js'), $pair.Label)
      [IO.File]::WriteAllText((Join-Path $part 'backend/dist/scripts/bootstrap-admin.js'), $pair.Label)
      [IO.File]::WriteAllText((Join-Path $part 'backend/dist/infrastructure/homologation-database-target.js'), $pair.Label)
      [IO.File]::WriteAllText((Join-Path $part 'frontend/dist/index.html'), ('AMBIENTE DE HOMOLOGAÇÃO DOCUMENTO DE TESTE — HOMOLOGAÇÃO ' + $pair.Label))
      $info = @{ environment='homologation'; sourceCommit=$commit; frontendVersion='0.1.0'; homologationMarkerVerified=$true }
      [IO.File]::WriteAllText((Join-Path $part 'frontend/build-info.json'), (ConvertTo-Json $info))
    }
    $items = @(New-ReleaseArtifactItems -InstallRoot (Join-Path $base 'active') -StageRoot (Join-Path $base 'stage') -BackupRoot (Join-Path $base 'backup') -CompleteRuntime $true)
    return [pscustomobject]@{ Root=$base; Items=$items; Journal=(Join-Path $base 'backup/journal.json') }
  }
  foreach ($scenario in @('success','before-move','after-first','after-unrecorded-move','http','rollback-failure','preactivation-http-failure')) {
    $case = New-Case $scenario
    $global:ServiceState['fixture-backend'] = [ServiceProcess.ServiceControllerStatus]::Running
    $global:ServiceState['fixture-caddy'] = [ServiceProcess.ServiceControllerStatus]::Running
    # Actual validator and its helper chain run against tiny artifacts; native runtime validation
    # is independently covered with the complete release ZIP by the main suite.
    $package = [pscustomobject]@{ CompleteRuntime=$false; SourceCommit=$commit; BackendVersion='0.1.0'; FrontendVersion='0.1.0' }
    $ops = New-ServiceOperations -HostName 'fixture.invalid' -BackendService 'fixture-backend' -CaddyService 'fixture-caddy' -InstallRoot (Join-Path $case.Root 'active') -PackageInfo $package
    $realMove = $ops.MoveArtifact
    $fault = @{ Moves=0; HttpCalls=0; Scenario=$scenario }
    $ops.MoveArtifact = {
      param($Source, $Destination)
      $fault.Moves++
      if (($fault.Scenario -in @('before-move','preactivation-http-failure') -and $fault.Moves -eq 1) -or
          ($fault.Scenario -eq 'after-first' -and $fault.Moves -eq 2) -or
          ($fault.Scenario -eq 'rollback-failure' -and $fault.Moves -in @(5,6))) { throw 'injected move failure' }
      & $realMove $Source $Destination
      if ($fault.Scenario -eq 'after-unrecorded-move' -and $fault.Moves -eq 1) { throw 'interrupted after native move, before flag' }
    }.GetNewClosure()
    $ops.ValidateHttp = {
      $fault.HttpCalls++
      if (($fault.Scenario -eq 'http' -and $fault.HttpCalls -eq 1) -or $fault.Scenario -eq 'preactivation-http-failure') { throw 'injected HTTP failure' }
    }.GetNewClosure()
    $failure = $null
    try { [void](Invoke-ArtifactSwapTransaction -Items $case.Items -JournalPath $case.Journal -SourceCommit $commit -Operations $ops) } catch { $failure = $_.Exception.Message }
    $journal = [IO.File]::ReadAllText($case.Journal) | ConvertFrom-Json
    Assert-Test (@($journal.artifacts).Count -eq 3) 'Complete runtime must swap three artifacts.'
    if ($scenario -eq 'success') {
      Assert-Test ($null -eq $failure -and $journal.status -ceq 'success') ('Real factory activation failed: ' + $failure)
      Assert-Test ($fault.Moves -eq 6) 'Three backups plus three activations required.'
      Assert-Test ([IO.File]::ReadAllText((Join-Path $case.Root 'active/backend/node_modules/fixture/version')) -ceq '7.10.1') 'New node_modules not active.'
      Assert-Test ([IO.File]::ReadAllText((Join-Path $case.Root 'backup/backend/node_modules/fixture/version')) -ceq '7.10.0') 'Original node_modules not preserved.'
    } elseif ($scenario -eq 'preactivation-http-failure') {
      Assert-Test ($journal.status -ceq 'pre-activation-recovery-incomplete') 'Do not call service-only recovery failure an artifact rollback failure.'
    } elseif ($scenario -eq 'rollback-failure') {
      Assert-Test ($journal.status -ceq 'rollback-incomplete') 'Real incomplete rollback must remain blocked.'
      # Authorized recovery simulation only in this temporary fixture, then rehydrate the journal.
      Restore-UpdateArtifacts -Items $case.Items -JournalPath $case.Journal -SourceCommit $commit -Operations $ops
    } else {
      $expected = if ($scenario -eq 'before-move') { 'failed-before-activation-recovered' } else { 'rolled-back' }
      Assert-Test ($journal.status -ceq $expected) ('Incorrect recovery classification: ' + $journal.status + ' / ' + $failure)
    }
    if ($scenario -ne 'success') {
      Assert-Test ([IO.File]::ReadAllText((Join-Path $case.Root 'active/backend/node_modules/fixture/version')) -ceq '7.10.0') 'Recovery lost previous dependencies.'
      Assert-Test ([IO.File]::ReadAllText((Join-Path $case.Root 'active/backend/package-lock.json')) -ceq '7.10.0') 'Recovery lost previous lock.'
      $saved = [IO.File]::ReadAllText($case.Journal) | ConvertFrom-Json
      foreach ($item in $case.Items) {
        $record = @($saved.artifacts | Where-Object { $_.name -ceq $item.Name })[0]
        $item.OldMoved = [bool]$record.previousMovedToBackup
        $item.NewActive = [bool]$record.newArtifactActive
        $item.Restored = [bool]$record.previousRestored
        $item.OriginalFingerprint = $record.originalFingerprint
        $item.PreparedFingerprint = $record.preparedFingerprint
      }
      $beforeRepeat = $fault.Moves
      $journalHash = (Get-FileHash -LiteralPath $case.Journal).Hash
      Restore-UpdateArtifacts -Items $case.Items -JournalPath $case.Journal -SourceCommit $commit -Operations $ops
      Restore-UpdateArtifacts -Items $case.Items -JournalPath $case.Journal -SourceCommit $commit -Operations $ops
      Assert-Test ($fault.Moves -eq $beforeRepeat -and (Get-FileHash -LiteralPath $case.Journal).Hash -ceq $journalHash) 'Repeated recovery changed restored artifacts or journal.'
    }
    'PASS: real script-local factory, helpers, renames, journal and recovery: ' + $scenario
  }

  # Exercise the real apply/preparation path. Inject only the write failure, not the
  # extractor, journal writer or staging cleanup, and never read a server env file.
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  function Assert-UpdateDestination { param($InstallRoot,$PackageInfo) }
  $prepCase = New-Case 'preparation-failure'
  $prepRoot = Join-Path $prepCase.Root 'active'
  $prepFingerprints = @{}
  foreach ($item in $prepCase.Items) { $prepFingerprints[$item.Name] = Get-UpdateArtifactFingerprint -Path $item.TargetPath }
  $prepServices = $global:ServiceCalls
  $prepZip = Join-Path $Root 'preparation.zip'
  $archive = [IO.Compression.ZipFile]::Open($prepZip, [IO.Compression.ZipArchiveMode]::Create)
  try { $entry=$archive.CreateEntry('backend/package.json'); $writer=New-Object IO.StreamWriter($entry.Open()); try { $writer.Write('{}') } finally { $writer.Dispose() } } finally { $archive.Dispose() }
  $prepPackage = [pscustomobject]@{ CompleteRuntime=$false; SourceCommit=$commit; Sha256=(Get-FileHash $prepZip).Hash.ToLowerInvariant() }
  $realExpand = ${function:Expand-ValidatedUpdatePackage}
  function Expand-ValidatedUpdatePackage { param($ZipPath,$StageRoot,$InstallRoot,$PackageInfo)
    & $realExpand -ZipPath $ZipPath -StageRoot $StageRoot -InstallRoot $InstallRoot -PackageInfo $PackageInfo -BeforeWrite { throw 'injected preparation failure' }
  }
  Expect-Failure { Invoke-HomologationUpdateApply -PackageInfo $prepPackage -InstallRoot $prepRoot -ZipPath $prepZip -Operations @{} } '*injected preparation failure*'
  Set-Item function:Expand-ValidatedUpdatePackage -Value $realExpand
  $prepJournals = @(Get-ChildItem -LiteralPath (Join-Path $prepRoot 'updates') -Filter journal.json -Recurse)
  Assert-Test ($prepJournals.Count -eq 1 -and ([IO.File]::ReadAllText($prepJournals[0].FullName) | ConvertFrom-Json).status -ceq 'preparation-failed') 'Preparation failure not journaled.'
  Assert-Test (@(Get-ChildItem -LiteralPath (Join-Path $prepRoot 'updates') -Filter 'stage-*').Count -eq 1) 'Failed staging removed.'
  Assert-Test ($global:ServiceCalls -eq $prepServices) 'Preparation touched services.'
  foreach ($item in $prepCase.Items) {
    Assert-Test ((Get-UpdateArtifactFingerprint -Path $item.TargetPath) -ceq $prepFingerprints[$item.Name]) 'Preparation changed active artifact.'
  }
  'PASS: real apply preparation failure preserves staging/journal and never stops services.'

  # Execute the exact footer with a real ShouldProcess confirmation. Only preflight and
  # the final apply boundary are replaced; ACL commands below are the real NTFS cmdlets.
  $script:ExpectedInstallRoot = Join-Path $Root 'confirmation-target'
  $script:ExpectedPackageSha256 = 'fixture'
  $script:ExpectedSourceCommit = $commit
  $script:ExpectedHost = 'fixture.invalid'
  $script:ExpectedServices = @('fixture-backend','fixture-caddy')
  $global:Applied = 0
  function Get-ValidatedPackageInfo { param($Path,$ExpectedSha256,$ExpectedCommit,$LoginMarker,$DocumentMarker)
    [pscustomobject]@{ Path=$Path; SourceCommit=$commit; BackendVersion='0.1.0'; FrontendVersion='0.1.0' }
  }
  function Assert-UpdateDestination { param($InstallRoot,$PackageInfo) }
  function Assert-Administrator {}
  function Invoke-HomologationUpdateApply { param($PackageInfo,$InstallRoot,$ZipPath,$Operations)
    $global:Applied++
    [void][IO.Directory]::CreateDirectory($InstallRoot)
    Set-StageDirectoryAcl -StageDirectory (Join-Path $InstallRoot 'stage') -TargetDirectory $InstallRoot
    # Exercise the file ACL path in the real ZIP extractor with inherited ConfirmPreference=Low.
    $fixtureZip = Join-Path $Root 'acl.zip'
    $archive = [IO.Compression.ZipFile]::Open($fixtureZip, [IO.Compression.ZipArchiveMode]::Create)
    try { $entry=$archive.CreateEntry('backend/package.json'); $writer=New-Object IO.StreamWriter($entry.Open()); try { $writer.Write('{}') } finally { $writer.Dispose() } } finally { $archive.Dispose() }
    [void][IO.Directory]::CreateDirectory((Join-Path $InstallRoot 'backend'))
    [IO.File]::WriteAllText((Join-Path $InstallRoot 'backend/package.json'), '{}')
    $info=[pscustomobject]@{ Sha256=(Get-FileHash $fixtureZip).Hash.ToLowerInvariant(); CompleteRuntime=$false }
    Expand-ValidatedUpdatePackage -ZipPath $fixtureZip -StageRoot (Join-Path $InstallRoot 'expanded') -InstallRoot $InstallRoot -PackageInfo $info
    $confirmJournal = Join-Path $InstallRoot 'confirmation-journal.json'
    Write-UpdateJournal -Path $confirmJournal -Status 'fixture-first' -SourceCommit $commit -Items @() -Message 'fixture'
    Write-UpdateJournal -Path $confirmJournal -Status 'fixture-second' -SourceCommit $commit -Items @() -Message 'fixture'
    # Real service closures target only the private fake commands above.
    & $Operations.StopServices
    & $Operations.StartServices
  }
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $footer = [scriptblock]::Create('[CmdletBinding(SupportsShouldProcess=$true,ConfirmImpact="High")] param([string]$PackagePath,[switch]$Apply)' + "`n" + $Entrypoint)
  $preference = $ConfirmPreference
  & $footer -PackagePath 'fixture.zip' -Apply -Confirm | Out-Null
  Assert-Test ($global:Applied -eq 1 -and $ConfirmPreference -eq $preference) 'Confirmation changed global preference or skipped apply.'
  $beforeServices = $global:ServiceCalls
  $beforeFiles = Get-UpdateArtifactFingerprint -Path $Root
  $beforeAcls = @(@(Get-Item -LiteralPath $Root) + @(Get-ChildItem -LiteralPath $Root -Recurse -Force) | ForEach-Object { $_.FullName + ':' + (Get-Acl -LiteralPath $_.FullName).Sddl }) -join "`n"
  $script:ExpectedInstallRoot = Join-Path $Root 'whatif-target'
  & $footer -PackagePath 'fixture.zip' -Apply -WhatIf | Out-Null
  Assert-Test ($global:Applied -eq 1 -and $global:ServiceCalls -eq $beforeServices) 'WhatIf reached a mutating boundary.'
  $afterFiles = Get-UpdateArtifactFingerprint -Path $Root
  $afterAcls = @(@(Get-Item -LiteralPath $Root) + @(Get-ChildItem -LiteralPath $Root -Recurse -Force) | ForEach-Object { $_.FullName + ':' + (Get-Acl -LiteralPath $_.FullName).Sddl }) -join "`n"
  Assert-Test ($beforeFiles -ceq $afterFiles -and $beforeAcls -ceq $afterAcls -and -not (Test-Path $script:ExpectedInstallRoot)) 'WhatIf modified file content, paths or ACLs.'
  'PASS: actual ShouldProcess footer, real directory/file ACLs, fake services and read-only WhatIf.'
}
'@
try {
  [void][IO.Directory]::CreateDirectory($testRoot)
  [void]$engine.AddScript($harness).AddArgument($definitions).AddArgument($testRoot).AddArgument($entrypoint)
  if ($VerifyBrokenClosureRegression) {
    $expectedFailure = ''
    try { [void]$engine.Invoke() } catch { $expectedFailure = $_.Exception.Message }
    $expectedFailure += ($engine.Streams.Error | Out-String)
    if ($expectedFailure -notlike '*Move-UpdateArtifact*' -or $expectedFailure -notlike '*Real factory activation failed*') {
      throw ('Original unbound closure was not caught by the real-scope suite: ' + $expectedFailure)
    }
    Write-Output 'PASS: regression sensitivity proved: restoring the original unbound production callback fails with Move-UpdateArtifact unresolved.'
    return
  }
  $output = $engine.Invoke()
  if ($engine.HadErrors) { throw ($engine.Streams.Error | Out-String) }
  $output | ForEach-Object { Write-Output $_ }
  if ($testHost.TestUI.Confirmations -ne 1) { throw ('Expected one outer confirmation, received ' + $testHost.TestUI.Confirmations) }
  Write-Output 'PASS: exactly one confirmation; production function scopes tested in an isolated runspace, without real services or databases.'
} finally {
  $engine.Dispose()
  $runspace.Dispose()
  $resolvedRoot = [IO.Path]::GetFullPath($testRoot)
  $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if (-not $resolvedRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not (Split-Path -Leaf $resolvedRoot).StartsWith('GestorOS-RealScope-')) { throw 'Unsafe test cleanup path.' }
  if (Test-Path -LiteralPath $resolvedRoot) { Remove-Item -LiteralPath $resolvedRoot -Recurse -Force -Confirm:$false }
}
