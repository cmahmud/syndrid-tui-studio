param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+([\-+][0-9A-Za-z.-]+)?$')]
    [string]$Version
)

$ErrorActionPreference = 'Stop'

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is required but was not found in PATH."
    }
}

Require-Command git
Require-Command gh
Require-Command npm

if (-not (Test-Path '.git')) {
    throw 'Run this script from the root of the Git repository.'
}

$dirty = git status --porcelain
if ($dirty) {
    throw 'The Git working tree is not clean. Commit or stash changes before publishing a release.'
}

$login = gh api user --jq .login
$remote = git remote get-url origin
Write-Host "GitHub account: $login"
Write-Host "Origin:         $remote"
Write-Host "Release:        v$Version"
Write-Host ''

$confirmation = Read-Host 'Type RELEASE to update the version, commit, tag, and push this release'
if ($confirmation -ne 'RELEASE') {
    throw 'Release cancelled.'
}

npm version $Version --no-git-tag-version
npm run verify:syndrid

git add package.json package-lock.json
git commit -m "release: v$Version"
git tag "v$Version"
git push origin HEAD
git push origin "v$Version"

Write-Host ''
Write-Host 'Tag pushed. GitHub Actions will build the Windows installer and attach it to the GitHub Release.'
