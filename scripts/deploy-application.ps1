<# Deploy a generated application: browser GitHub sign-in, private repository push, then Azure provisioning. #>
[CmdletBinding()]
param(
  [string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$RepositoryName = '',
  [string]$WorkingBranch = 'develop',
  [string]$ConfigPath = '',
  [switch]$Yes,
  [switch]$Public
)
$ErrorActionPreference = 'Stop'
$entry = Join-Path $PSScriptRoot 'deploy\index.mjs'
$arguments = @($entry, '--root', ([System.IO.Path]::GetFullPath($ProjectPath)), '--working-branch', $WorkingBranch)
if ($RepositoryName) { $arguments += @('--name', $RepositoryName) }
if ($ConfigPath) { $arguments += @('--config', ([System.IO.Path]::GetFullPath($ConfigPath))) }
if ($Yes) { $arguments += '--yes' }
if ($Public) { $arguments += '--public' }
& node @arguments
if ($LASTEXITCODE -ne 0) { throw "Deployment failed with exit code $LASTEXITCODE." }
