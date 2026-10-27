[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:TestRoot = Join-Path ([IO.Path]::GetTempPath()) ('GestorOS-HttpsTests-' + [guid]::NewGuid().ToString('N'))
$script:TestCommit = '1111111111111111111111111111111111111111'
$script:LoginMarker = 'AMBIENTE DE HOMOLOGAÇÃO'
$script:DocumentMarker = 'DOCUMENTO DE TESTE — HOMOLOGAÇÃO'
$updater = Join-Path (Split-Path -Parent $PSScriptRoot) 'Update-HomologationRelease.ps1'
foreach ($sourcePath in @($updater, (Join-Path $PSScriptRoot 'Test-UpdateHomologationRelease.ps1'))) {
  $tokens=$null; $errors=$null
  $ast = [Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$errors)
  if (@($errors).Count -gt 0) { throw 'PowerShell parser rejected test source.' }
  foreach ($definition in $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
    if ($sourcePath -ceq $updater -or $definition.Name -in @('New-TransactionCase', 'New-TestOperations', 'Assert-Test', 'Assert-Throws')) { Invoke-Expression $definition.Extent.Text }
  }
}
try {
  [void][IO.Directory]::CreateDirectory($script:TestRoot)
  $fakeCurl = Join-Path $script:TestRoot 'curl.exe'
  # Native fixture, not a network client: test process exit codes/stdout/stderr as PS 5.1 sees them.
  Add-Type -OutputAssembly $fakeCurl -OutputType ConsoleApplication -TypeDefinition @'
using System;
using System.IO;
using System.Diagnostics;
public class CurlFixture {
  public static int Main(string[] args) {
    string self = Process.GetCurrentProcess().MainModule.FileName;
    int call = File.ReadAllLines(self + ".calls").Length + 1;
    File.AppendAllText(self + ".calls", string.Join("\t", args) + Environment.NewLine);
    string mode = File.ReadAllText(self + ".mode").Trim();
    if (args.Length == 0 || args[0] != "--disable" || Array.IndexOf(args,"--ssl-revoke-best-effort") < 0 ||
        Array.IndexOf(args,"--insecure") >= 0 || Array.IndexOf(args,"-k") >= 0 || Array.IndexOf(args,"--ssl-no-revoke") >= 0 ||
        Array.IndexOf(args,"=https") < 0 || Array.IndexOf(args,"fixture.invalid:443:127.0.0.1") < 0) { return 99; }
    bool api = args[args.Length-1] == "https://fixture.invalid/api/v1/auth/me";
    if (!api && args[args.Length-1] != "https://fixture.invalid/") { return 98; }
    string good = api ? "401|application/json; charset=utf-8" : "200|text/html; charset=utf-8";
    if (mode == "tls35" || (mode == "api-tls35" && api) || (mode == "recover-after-tls" && call == 1)) {
      Console.Write(good); Console.Error.Write("curl: (35) schannel: CRYPT_E_NO_REVOCATION_CHECK (0x80092012) never-log-this-probe-text"); return 35;
    }
    if (mode == "untrusted" || mode == "mismatch" || mode == "revoked") {
      Console.Write(good); Console.Error.Write(mode == "untrusted" ? "CERT_E_UNTRUSTEDROOT" : mode == "mismatch" ? "CERT_E_CN_NO_MATCH" : "CERT_E_REVOKED"); return 60;
    }
    if (mode == "connect") { Console.Write(good); return 7; }
    if (mode == "timeout") { Console.Write(good); return 28; }
    if (mode == "unsupported") { return 2; }
    if (mode == "http500") { Console.Write("500|text/html"); return 0; }
    if (mode == "api200" && api) { Console.Write("200|application/json"); return 0; }
    if (mode == "bad-content") { Console.Write("200|application/json"); return 0; }
    if (mode == "malformed") { Console.Write("invalid-output"); return 0; }
    Console.Write(good); return 0;
  }
}
'@
  function Set-CurlFixture { param($Mode)
    [IO.File]::WriteAllText($fakeCurl + '.mode', $Mode)
    [IO.File]::WriteAllText($fakeCurl + '.calls', '')
  }
  foreach ($mode in @('ok','tls35','api-tls35','untrusted','mismatch','revoked','connect','timeout','unsupported','http500','api200','bad-content','malformed')) {
    Set-CurlFixture $mode
    $failure=$null
    try { Assert-HomologationHttps -HostName 'fixture.invalid' -CurlPath $fakeCurl } catch { $failure=$_.Exception }
    if ($mode -ceq 'ok') {
      Assert-Test ($null -eq $failure -and [IO.File]::ReadAllLines($fakeCurl + '.calls').Length -eq 2) 'Expected successful Frontend/API checks.'
    } else {
      Assert-Test ($null -ne $failure) ('Invalid HTTPS result accepted: ' + $mode)
      Assert-Test ($failure.Message -notlike '*never-log-this-probe-text*') 'Raw curl stderr leaked.'
      if ($mode -in @('tls35','api-tls35')) {
        Assert-Test ($failure.Data['CurlExitCode'] -eq 35 -and $failure.Message -like '*CRYPT_E_NO_REVOCATION_CHECK*') 'TLS exit code/diagnostic was lost.'
      }
      if ($mode -in @('untrusted','mismatch','revoked')) { Assert-Test ($failure.Data['FailureKind'] -ceq 'tls') 'Certificate validation failure was not preserved.' }
    }
    Write-Output ('PASS: native curl fixture with strict TLS flags, exit code and HTTP/media type: ' + $mode)
  }

  # Invoke the production closure too. Its native command resolves only to the private
  # fixture; assert that resolution before invocation and restore this process PATH.
  $previousPath=$env:PATH
  try {
    $env:PATH=$script:TestRoot + ';' + $previousPath
    Assert-Test ((Get-Command curl.exe -CommandType Application | Select-Object -First 1).Source -ceq $fakeCurl) 'Native fixture resolution unsafe.'
    $factoryOps=New-ServiceOperations -HostName 'fixture.invalid' -BackendService 'unused-backend' -CaddyService 'unused-caddy' -InstallRoot $script:TestRoot -PackageInfo ([pscustomobject]@{})
    Set-CurlFixture 'ok'
    & $factoryOps.ValidateHttp
    Set-CurlFixture 'tls35'
    Assert-Throws { & $factoryOps.ValidateHttp } '*curlExit=35*'
    Write-Output 'PASS: actual production HTTPS closure uses the native fixture and propagates TLS failure.'
  } finally { $env:PATH=$previousPath }

  $httpsCommand = Get-Command Assert-HomologationHttps -CommandType Function
  foreach ($scenario in @('deploy-success','https-recovered','https-still-failed','service-restart-failed','restore-failed')) {
    Set-CurlFixture $(if ($scenario -ceq 'deploy-success') { 'ok' } elseif ($scenario -ceq 'https-recovered') { 'recover-after-tls' } else { 'tls35' })
    $case=New-TransactionCase -Name $scenario -CompleteRuntime
    $state=@{ MoveCount=0; StopCount=0; StoppedWaitCount=0; StartCount=0; RunningWaitCount=0; HttpCount=0; FailMoveCalls=@{}; FailFirstStart=$false; FailFirstHttp=$false }
    if ($scenario -ceq 'restore-failed') { $state.FailMoveCalls=@{ '7'='injected restore failure' } }
    $ops=New-TestOperations $state
    $ops.ValidateHttp = { & $httpsCommand -HostName 'fixture.invalid' -CurlPath $fakeCurl }.GetNewClosure()
    if ($scenario -ceq 'service-restart-failed') {
      $ops.StartServices = { $state.StartCount++; if ($state.StartCount -eq 2) { throw 'injected recovery service start failure' } }.GetNewClosure()
    }
    $failure=$null
    try { [void](Invoke-ArtifactSwapTransaction -Items $case.Items -JournalPath $case.Journal -SourceCommit $script:TestCommit -Operations $ops) } catch { $failure=$_.Exception.Message }
    $journal=[IO.File]::ReadAllText($case.Journal) | ConvertFrom-Json
    $expectedStatus=switch ($scenario) {
      'deploy-success' { 'success' }; 'https-recovered' { 'rolled-back' }; 'https-still-failed' { 'rollback-https-validation-failed' }
      'service-restart-failed' { 'rollback-service-restart-failed' }; 'restore-failed' { 'rollback-incomplete' }
    }
    Assert-Test ($journal.status -ceq $expectedStatus) ('Incorrect recovery status: ' + $scenario + ' / ' + $journal.status + ' / ' + $failure)
    if ($scenario -ceq 'deploy-success') { Assert-Test ($null -eq $failure) 'Successful deployment threw.' }
    else {
      Assert-Test ($null -ne $failure -and $journal.recovery.originalFailurePhase -ceq 'validate-https') 'Unvalidated recovery reported success or lost original failure phase.'
      Assert-Test ($journal.recovery.originalFailureMessage -like '*curlExit=35*' -and $journal.message -notlike '*never-log-this-probe-text*') 'Journal lost TLS evidence or leaked stderr.'
      if ($scenario -ceq 'https-still-failed') {
        Assert-Test ($journal.recovery.artifactsVerified -and $journal.recovery.servicesVerified -and -not $journal.recovery.httpsVerified -and $journal.recovery.failurePhase -ceq 'validate-https') 'HTTPS-only recovery confused with failed file restore.'
      }
      if ($scenario -ceq 'service-restart-failed') {
        Assert-Test ($journal.recovery.artifactsVerified -and -not $journal.recovery.servicesVerified -and -not $journal.recovery.httpsVerified -and $journal.recovery.failurePhase -ceq 'restart-services') 'Service restart failure misclassified.'
      }
      if ($scenario -ceq 'restore-failed') {
        Assert-Test (-not $journal.recovery.artifactsVerified -and $journal.recovery.failurePhase -ceq 'restore-artifacts' -and $state.StartCount -eq 1) 'Incomplete restore was masked or restarted.'
      } else {
        Assert-Test ([IO.File]::ReadAllText((Join-Path $case.Install 'backend/node_modules/fixture/version')) -ceq '7.10.0') 'Original dependencies not restored.'
        # Rehydrate on-disk recovery records, repeat file recovery, keep failed HTTPS evidence unchanged.
        foreach ($item in $case.Items) {
          $record=@($journal.artifacts | Where-Object { $_.name -ceq $item.Name })[0]
          $item.OldMoved=$record.previousMovedToBackup; $item.NewActive=$record.newArtifactActive; $item.Restored=$record.previousRestored
          $item.OriginalFingerprint=$record.originalFingerprint; $item.PreparedFingerprint=$record.preparedFingerprint
        }
        $before=(Get-FileHash -LiteralPath $case.Journal).Hash
        $moves=$state.MoveCount
        Restore-UpdateArtifacts -Items $case.Items -JournalPath $case.Journal -SourceCommit $script:TestCommit -Operations $ops
        Restore-UpdateArtifacts -Items $case.Items -JournalPath $case.Journal -SourceCommit $script:TestCommit -Operations $ops
        Assert-Test ($before -ceq (Get-FileHash -LiteralPath $case.Journal).Hash -and $moves -eq $state.MoveCount) 'Idempotent recovery changed files/journal or erased failed HTTPS evidence.'
      }
    }
    Write-Output ('PASS: simulated deployment with actual HTTPS validator/native fixture and recovery journal: ' + $scenario)
  }
} finally {
  $cleanup=[IO.Path]::GetFullPath($script:TestRoot)
  $prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if (-not $cleanup.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or -not (Split-Path -Leaf $cleanup).StartsWith('GestorOS-HttpsTests-')) { throw 'Unsafe fixture cleanup path.' }
  if (Test-Path -LiteralPath $cleanup) { Remove-Item -LiteralPath $cleanup -Recurse -Force -Confirm:$false }
}
