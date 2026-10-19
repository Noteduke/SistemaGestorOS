[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$node = (Get-Command node.exe -ErrorAction Stop).Source
& $node (Join-Path $PSScriptRoot 'Build-HomologationRelease.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Pacote não aprovado. Consulte a falha do build isolado; a instalação ativa não foi alterada.' }
