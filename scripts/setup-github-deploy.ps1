#requires -Version 7.0
<#
One-time setup for .github/workflows/deploy-cloud-run.yml: keyless GitHub Actions access to Cloud Run.
Run it yourself in your own PowerShell (it asks before every step and can be re-run; steps that already exist are skipped):

  pwsh -NoProfile -File scripts/setup-github-deploy.ps1

Creates: a deployer service account with only the roles a release needs, a Workload Identity pool and GitHub OIDC
provider that trust only this repository's main branch, the GitHub repo variables, and a "production" environment
whose required reviewer approves every traffic switch. No service-account keys are created.
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$project = 'sincere-apex-511418-p0'
$projectNumber = '977401667230'
$region = 'asia-southeast1'
$service = 'hotel-price-hunter'
$registryRepo = 'hotel-price-hunter'
$runtimeSa = "hotel-price-hunter-runtime@$project.iam.gserviceaccount.com"
$deployerName = 'github-deployer'
$deployerSa = "$deployerName@$project.iam.gserviceaccount.com"
$pool = 'github'
$provider = 'github-oidc'
$repo = 'pohlipit23/hotel-price-hunter'
$repoId = '1415473235'          # numeric id: survives a rename, cannot be re-registered by someone else
$reviewerId = 63586939          # GitHub user pohlipit23
$providerName = "projects/$projectNumber/locations/global/workloadIdentityPools/$pool/providers/$provider"
$principalSet = "principalSet://iam.googleapis.com/projects/$projectNumber/locations/global/workloadIdentityPools/$pool/attribute.repository/$repo"
$manifestPath = Join-Path $PSScriptRoot '..\.local\integration\v5-catalogue-manifest.json'

function Invoke-Checked {
    param([string]$File, [string[]]$Arguments)
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File failed with exit $LASTEXITCODE. Stopping; re-run the script after fixing it." }
}
function Test-Quiet {
    param([string]$File, [string[]]$Arguments)
    & $File @Arguments *> $null
    return $LASTEXITCODE -eq 0
}
$script:number = 0
function Step {
    param([string]$Title, [string]$Why, [scriptblock]$Exists, [scriptblock]$Action)
    $script:number += 1
    Write-Host "`n[$script:number] $Title" -ForegroundColor Cyan
    Write-Host "    $Why"
    if ($Exists -and (& $Exists)) { Write-Host '    Already in place. Skipped.' -ForegroundColor DarkGray; return }
    $answer = Read-Host '    Run this step? (y = yes, s = skip, anything else stops)'
    if ($answer -eq 's') { Write-Host '    Skipped.' -ForegroundColor Yellow; return }
    if ($answer -ne 'y') { throw 'Stopped at your request. Nothing after this step ran.' }
    & $Action
    Write-Host '    Done.' -ForegroundColor Green
}

try {
    foreach ($tool in 'gcloud.cmd', 'gh') { Get-Command $tool -ErrorAction Stop | Out-Null }
    $account = (& gcloud.cmd config get-value account 2>$null)
    Write-Host "gcloud account: $account | project: $project | repo: $repo" -ForegroundColor Yellow
    if ((Read-Host 'Continue with these? (y/N)') -ne 'y') { throw 'Stopped before any change.' }

    Step 'Enable the Security Token Service API' 'Workload Identity Federation swaps the GitHub token for a short-lived Google token through STS.' `
        { (& gcloud.cmd services list --enabled --project=$project --filter='config.name=sts.googleapis.com' --format='value(config.name)') -eq 'sts.googleapis.com' } `
        { Invoke-Checked 'gcloud.cmd' @('services', 'enable', 'sts.googleapis.com', 'iamcredentials.googleapis.com', "--project=$project") }

    Step "Create the deployer service account ($deployerSa)" 'GitHub Actions acts as this account. It gets no key; only the federation below can use it.' `
        { Test-Quiet 'gcloud.cmd' @('iam', 'service-accounts', 'describe', $deployerSa, "--project=$project") } `
        { Invoke-Checked 'gcloud.cmd' @('iam', 'service-accounts', 'create', $deployerName, "--project=$project", '--display-name=GitHub Actions Cloud Run deployer') }

    Step "Create the Workload Identity pool ($pool)" 'A container for external identities (GitHub) that Google Cloud may trust.' `
        { Test-Quiet 'gcloud.cmd' @('iam', 'workload-identity-pools', 'describe', $pool, '--location=global', "--project=$project") } `
        { Invoke-Checked 'gcloud.cmd' @('iam', 'workload-identity-pools', 'create', $pool, '--location=global', "--project=$project", '--display-name=GitHub Actions') }

    Step "Create the GitHub OIDC provider ($provider)" "Trusts GitHub's token only for repository id $repoId on refs/heads/main. Other repos, forks and branches are refused." `
        { Test-Quiet 'gcloud.cmd' @('iam', 'workload-identity-pools', 'providers', 'describe', $provider, "--workload-identity-pool=$pool", '--location=global', "--project=$project") } `
        { Invoke-Checked 'gcloud.cmd' @('iam', 'workload-identity-pools', 'providers', 'create-oidc', $provider, "--workload-identity-pool=$pool", '--location=global', "--project=$project",
            '--issuer-uri=https://token.actions.githubusercontent.com', '--display-name=GitHub OIDC',
            '--attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref',
            "--attribute-condition=assertion.repository_id=='$repoId' && assertion.ref=='refs/heads/main'") }

    Step 'Let this repository act as the deployer' 'Grants roles/iam.workloadIdentityUser on the deployer account to workflows from this repository only.' $null `
        { Invoke-Checked 'gcloud.cmd' @('iam', 'service-accounts', 'add-iam-policy-binding', $deployerSa, "--project=$project", "--member=$principalSet", '--role=roles/iam.workloadIdentityUser', '--condition=None') }

    Step 'Deployer: deploy and move traffic on this one service' 'roles/run.developer on hotel-price-hunter only, not on other services.' $null `
        { Invoke-Checked 'gcloud.cmd' @('run', 'services', 'add-iam-policy-binding', $service, "--region=$region", "--project=$project", "--member=serviceAccount:$deployerSa", '--role=roles/run.developer') }

    Step 'Deployer: read revisions' 'roles/run.viewer (read-only) on the project, to check the new revision is Ready.' $null `
        { Invoke-Checked 'gcloud.cmd' @('projects', 'add-iam-policy-binding', $project, "--member=serviceAccount:$deployerSa", '--role=roles/run.viewer', '--condition=None') }

    Step 'Deployer: run revisions as the existing runtime account' "roles/iam.serviceAccountUser on $runtimeSa only, so new revisions keep today's identity." $null `
        { Invoke-Checked 'gcloud.cmd' @('iam', 'service-accounts', 'add-iam-policy-binding', $runtimeSa, "--project=$project", "--member=serviceAccount:$deployerSa", '--role=roles/iam.serviceAccountUser', '--condition=None') }

    Step 'Deployer: push images' "roles/artifactregistry.writer on the $registryRepo repository only." $null `
        { Invoke-Checked 'gcloud.cmd' @('artifacts', 'repositories', 'add-iam-policy-binding', $registryRepo, "--location=$region", "--project=$project", "--member=serviceAccount:$deployerSa", '--role=roles/artifactregistry.writer') }

    Step 'GitHub: repository variables' 'GCP_WIF_PROVIDER, GCP_DEPLOYER_SA and ROOMDROP_CATALOGUE_MANIFEST (the 6 booking version pins baked into the image). Variables, not secrets: none of these grant access.' $null `
        {
            if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Catalogue manifest not found: $manifestPath" }
            Invoke-Checked 'gh' @('variable', 'set', 'GCP_WIF_PROVIDER', '--repo', $repo, '--body', $providerName)
            Invoke-Checked 'gh' @('variable', 'set', 'GCP_DEPLOYER_SA', '--repo', $repo, '--body', $deployerSa)
            $manifest = (Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json | ConvertTo-Json -Depth 20 -Compress)
            Invoke-Checked 'gh' @('variable', 'set', 'ROOMDROP_CATALOGUE_MANIFEST', '--repo', $repo, '--body', $manifest)
        }

    Step 'GitHub: "production" environment with you as required reviewer' 'Every traffic switch and rollback waits for your Approve click. Only the main branch may deploy to it.' $null `
        {
            $body = Join-Path ([System.IO.Path]::GetTempPath()) 'roomdrop-production-environment.json'
            @{ reviewers = @(@{ type = 'User'; id = $reviewerId }); deployment_branch_policy = @{ protected_branches = $false; custom_branch_policies = $true } } |
                ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $body -Encoding utf8NoBOM
            Invoke-Checked 'gh' @('api', '--method', 'PUT', "repos/$repo/environments/production", '--input', $body)
            Remove-Item -LiteralPath $body
            $policies = & gh api "repos/$repo/environments/production/deployment-branch-policies" --jq '.branch_policies[].name'
            if ($policies -notcontains 'main') {
                Invoke-Checked 'gh' @('api', '--method', 'POST', "repos/$repo/environments/production/deployment-branch-policies", '-f', 'name=main', '-f', 'type=branch')
            }
        }

    Write-Host "`nSetup complete." -ForegroundColor Green
    Write-Host 'Next: run the "Deploy to Cloud Run" workflow (Actions tab > Run workflow), or push a change under app/.'
    Write-Host 'The workflow stops at "promote" until you approve it in GitHub.'
} catch {
    Write-Host ("STOPPED: " + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
