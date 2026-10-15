[CmdletBinding()]
param(
    [ValidateSet('Plan', 'Provision', 'Build', 'Deploy', 'GrantAccess')][string]$Phase = 'Plan',
    [ValidatePattern('^([a-f0-9]{40})?$')][string]$SourceCommit = '',
    [ValidatePattern('^(sha256:[a-f0-9]{64})?$')][string]$ImageDigest = ''
)
# OFFLINE COMMAND BUNDLE ONLY. This script has no execution switch and never invokes gcloud or Docker.
# Official flags: https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run
# BuildKit: https://docs.docker.com/reference/cli/docker/buildx/build/#provenance
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$taskProject = 'sincere-apex-511418-p0'
$taskOperator = 'pete@altovo.com'
$taskRegion = 'asia-southeast1'
$taskService = 'hotel-price-hunter-agency'
$taskReader = "roomdrop-agency-reader@$taskProject.iam.gserviceaccount.com"
$taskIapAgent = 'service-977401667230@gcp-sa-iap.iam.gserviceaccount.com'
$taskRegistry = "$taskRegion-docker.pkg.dev"
$taskImage = "$taskRegistry/$taskProject/hotel-price-hunter/agency"
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskNonce = [guid]::NewGuid().ToString('N')
$taskDockerAuth = Join-Path $taskRoot ".local/agency-docker-auth-$taskNonce"
$taskSource = '<reviewed-40-character-clean-HEAD>'
$taskContext = '<verified-current-context-sha256>'
if ($SourceCommit) {
    # Only local Git/filesystem reads. Failure output is suppressed; never accept a dirty or inferred source pin.
    $taskSourceJson = & node (Join-Path $PSScriptRoot 'verify-agency-cloud.mjs') '--source-plan' "--source=$SourceCommit" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'The exact reviewed clean source/context check failed. Commit reviewed source before building.' }
    $taskSourceInfo = ($taskSourceJson | Out-String) | ConvertFrom-Json
    $taskSource = $taskSourceInfo.sourceCommit
    $taskContext = $taskSourceInfo.contextSha256
}
$taskTag = if ($SourceCommit) { "agency-$($taskSource.Substring(0,12))-$($taskContext.Substring(0,12))" } else { 'agency-REVIEWED_SOURCE_AND_CONTEXT_REQUIRED' }
$taskDigest = if ($ImageDigest) { $ImageDigest } else { 'sha256:INDEPENDENT_REGISTRY_DIGEST_REQUIRED' }
function Cloud-Step([string]$Name, [string[]]$CommandArguments, [string]$Gate = '') {
    return [ordered]@{ name = $Name; program = 'gcloud'; arguments = @($CommandArguments) + @("--account=$taskOperator", "--project=$taskProject", '--quiet', '--verbosity=error'); gate = $Gate }
}
function Docker-Step([string]$Name, [string[]]$CommandArguments) {
    return [ordered]@{ name = $Name; program = 'docker'; arguments = @("--config=$taskDockerAuth") + @($CommandArguments) }
}
$taskSteps = [ordered]@{
    Provision = @(
        (Cloud-Step 'Enable only IAP API' @('services','enable','iap.googleapis.com') 'Explicit cloud/API approval; verify fixed project and billing first.'),
        (Cloud-Step 'Create reader identity only if confirmed absent' @('iam','service-accounts','create','roomdrop-agency-reader','--display-name=RoomDrop agency read-only runtime') 'Stop on any name collision; never reuse a different identity.'),
        (Cloud-Step 'Grant project-wide Firestore viewer to dedicated runtime' @('projects','add-iam-policy-binding',$taskProject,"--member=serviceAccount:$taskReader",'--role=roles/datastore.viewer','--condition=None') 'Explicit IAM approval: reads ALL Firestore documents in this project; not a collection-level grant.'),
        ([ordered]@{ name = 'Create IAP service identity if needed'; program = 'https-request'; method = 'POST'; url = 'https://serviceusage.googleapis.com/v1beta1/projects/977401667230/services/iap.googleapis.com:generateServiceIdentity'; body = @{}; authAccount = $taskOperator; project = $taskProject; gate = 'Same explicit service-agent approval; authenticated in memory only. Returns Operation: monitor fixed project operation read-only. No beta SDK component install, no customer changes.' })
    )
    Build = @(
        (Docker-Step 'Build reviewed local source; load sole linux amd64 image' @('buildx','build','--platform=linux/amd64','--provenance=false','--load',"--label=org.opencontainers.image.revision=$taskSource","--label=com.roomdrop.build-context.sha256=$taskContext","--tag=${taskImage}:$taskTag",$taskRoot)),
        (Cloud-Step 'Capture short-lived registry token in memory only' @('auth','print-access-token') 'Never print/save token; pass only as stdin to the next docker login command.'),
        (Docker-Step 'Registry login with token from memory via stdin' @('login',$taskRegistry,'--username=oauth2accesstoken','--password-stdin')),
        (Docker-Step 'Upload new immutable agency image tag' @('push',"${taskImage}:$taskTag")),
        (Cloud-Step 'Read uploaded immutable digest' @('artifacts','docker','images','describe',"${taskImage}:$taskTag",'--format=json') 'Record independent approved digest and OCI labels in ignored pins; never deploy the tag.')
    )
    Deploy = @(
        (Cloud-Step 'Deploy separate IAP-only agency service using placeholder origin' @('run','deploy',$taskService,"--region=$taskRegion","--image=${taskImage}@$taskDigest","--service-account=$taskReader",'--iap','--no-allow-unauthenticated','--invoker-iam-check','--ingress=all','--execution-environment=gen2','--port=8080','--cpu=1','--memory=512Mi','--concurrency=4','--min=0','--max=1','--min-instances=0','--max-instances=1','--cpu-throttling','--no-cpu-boost','--timeout=30s',"--env-vars-file=$(Join-Path $taskRoot '.local/agency-cloud.env.yaml')",'--labels=app=roomdrop,surface=agency') 'Explicit service/cost/IAM approval, exact source+digest verified, no operator accessor grants exist; initial origin https://origin-not-ready.invalid.'),
        (Cloud-Step 'Read canonical agency origin and revision' @('run','services','describe',$taskService,"--region=$taskRegion",'--format=json')),
        (Cloud-Step 'Set independently checked canonical origin, retaining exact agency env' @('run','services','update',$taskService,"--region=$taskRegion",'--iap','--invoker-iam-check',"--env-vars-file=$(Join-Path $taskRoot '.local/agency-cloud.env.yaml')") 'Validate HTTPS canonical status.url; update only APP_ORIGIN in ignored env file before this step; still no operator access.'),
        (Cloud-Step 'Allow only IAP service agent to invoke agency service' @('run','services','add-iam-policy-binding',$taskService,"--region=$taskRegion","--member=serviceAccount:$taskIapAgent",'--role=roles/run.invoker','--condition=None') 'Explicit IAP-agent invocation approval; no customer binding or public principals.')
    )
    GrantAccess = @(
        (Cloud-Step 'Grant only named altovo operator access to this agency IAP resource' @('iap','web','add-iam-policy-binding','--resource-type=cloud-run',"--service=$taskService","--region=$taskRegion",'--member=user:pete@altovo.com','--role=roles/iap.httpsResourceAccessor','--condition=None') 'Explicit human IAP-access approval AFTER before-access metadata/source verification. Any inherited-IAM gap remains explicit and needs an operator decision, never a fabricated pass.')
    )
}
$taskSelected = [ordered]@{}
foreach ($taskName in @('Provision','Build','Deploy','GrantAccess')) { if ($Phase -eq 'Plan' -or $Phase -eq $taskName) { $taskSelected[$taskName] = $taskSteps[$taskName] } }
[ordered]@{
    status = 'offline-command-bundle'; executedCloudCommands = 0; account = $taskOperator; project = $taskProject; projectNumber = '977401667230'; organization = '222849345270'; region = $taskRegion; service = $taskService
    approval = 'Cloud mutation auto-review was rejected before execution; obtain explicit API, IAM, new-service, image-upload and cost approval before executing the relevant phase.'
    source = @{ commit = $taskSource; contextSha256 = $taskContext; tag = $taskTag; verifiedCleanLocalSource = [bool]$SourceCommit }
    iamBlastRadius = @('Reader roles/datastore.viewer is project-wide read access to every Firestore document.', 'IAP service agent receives roles/run.invoker only on the agency service.', 'Only user:pete@altovo.com receives roles/iap.httpsResourceAccessor only on the agency IAP resource.')
    environmentFiles = @{ initial = '.local/agency-cloud.env.yaml'; canonical = '.local/agency-cloud.env.yaml'; keys = @('NODE_ENV','GOOGLE_CLOUD_PROJECT','APP_SURFACE','AGENCY_AUTH_MODE','APP_ORIGIN','AGENCY_IAP_AUDIENCE','AGENCY_IAP_ALLOWED_SUBJECTS'); subject = 'Exactly one independently verified signed subject from ignored operator mapping; never print it.' }
    buildAuth = @{ directory = $taskDockerAuth; ownerNonce = $taskNonce; instructions = @('Create only this fresh ignored directory and owner marker before registry login.', 'Every Docker command uses --config on this directory; do not alter global Docker config or DOCKER_CONFIG.', 'Use account-scoped access token in memory only and docker login --password-stdin; never use configure-docker or an active-account fallback.', 'Finally verify resolved absolute path is a direct .local child named agency-docker-auth-<nonce>, verify no reparse points and exact owner marker, then Remove-Item -LiteralPath that directory -Recurse -Force.') }
    limits = @{ minInstances = 0; maxServiceInstances = 1; maxRevisionInstances = 1; cpu = 1; memory = '512Mi'; cpuBoost = $false; advisor = 'absent'; spendingCap = 'Resource limits are not a hard billing cap.' }
    phases = $taskSelected
} | ConvertTo-Json -Depth 12
