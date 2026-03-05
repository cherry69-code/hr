<#
  Usage (PowerShell):
    1) Install git-filter-repo:
         pip install git-filter-repo
       or brew install git-filter-repo (macOS)
    2) Run this script from any folder:
         pwsh -File scripts/rewrite-history.ps1 -RepoUrl https://github.com/cherry69-code/hr.git

  This will:
    - Clone a fresh copy to a temp folder
    - Remove backend/scripts/migrate_db.js from history
    - Redact common secret patterns
    - Force-push the cleaned history to origin
#>
param(
  [Parameter(Mandatory=$true)][string]$RepoUrl,
  [string]$Branch = "main"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Check-Tool($name) {
  $exists = (Get-Command $name -ErrorAction SilentlyContinue) -ne $null
  if (-not $exists) {
    throw "Required tool '$name' not found in PATH."
  }
}

Check-Tool git

# Ensure git-filter-repo is available
try {
  git filter-repo --help | Out-Null
} catch {
  throw "git filter-repo not found. Install with 'pip install git-filter-repo' or 'brew install git-filter-repo'."
}

$work = Join-Path $env:TEMP ("repo-rewrite-" + (Get-Date -Format "yyyyMMddHHmmss"))
Write-Host "Working directory: $work"
New-Item -ItemType Directory -Path $work | Out-Null

Push-Location $work

git clone $RepoUrl clean-repo
Set-Location clean-repo

git checkout $Branch

# Tag backup
$tag = "pre-history-rewrite-" + (Get-Date -Format "yyyyMMddHHmmss")
git tag $tag

# Remove the file from history
git filter-repo --invert-paths --path backend/scripts/migrate_db.js

# Create redaction file
$repl = @"
mongodb\+srv://==> REDACTED
JWT_SECRET==> REDACTED
SMTP_PASSWORD==> REDACTED
CLOUDINARY_API_SECRET==> REDACTED
PRIVATE KEY-----==> REDACTED
"@
Set-Content -Path replacements.txt -Value $repl -Encoding UTF8

git filter-repo --replace-text replacements.txt

# Force push
git push --force origin $Branch
git push --force --tags

Pop-Location
Write-Host "Rewrite complete. Original backup tag: $tag"

