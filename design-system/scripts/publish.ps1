# Publish @wizklub/design-tokens to AWS CodeArtifact.
# Usage (from repo root):
#   .\design-system\scripts\publish.ps1 -Domain wizklub -AccountId 123456789012 -Repository npm-packages -Region ap-south-1
param(
  [Parameter(Mandatory = $true)][string]$Domain,
  [Parameter(Mandatory = $true)][string]$AccountId,
  [Parameter(Mandatory = $true)][string]$Repository,
  [Parameter(Mandatory = $true)][string]$Region,
  [switch]$SkipPublish
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Ds = Join-Path $Root 'design-system'
$Registry = "https://${Domain}-${AccountId}.d.codeartifact.${Region}.amazonaws.com/npm/${Repository}/"

Write-Host "Registry: $Registry"
Write-Host "Logging in to CodeArtifact..."
aws codeartifact login --tool npm --domain $Domain --domain-owner $AccountId --repository $Repository --region $Region

$pkgPath = Join-Path $Ds 'package.json'
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$pkg.publishConfig = @{ registry = $Registry }
$pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath -Encoding utf8

Push-Location $Ds
try {
  npm run build
  if (-not $SkipPublish) {
    npm publish
    Write-Host "Published $($pkg.name)@$($pkg.version)"
  } else {
    Write-Host "SkipPublish set — build done, registry updated in package.json"
  }
} finally {
  Pop-Location
}
