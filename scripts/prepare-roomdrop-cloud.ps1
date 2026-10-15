[CmdletBinding()]
param(
    [ValidateSet('Plan','Preflight','Provision','Build','DeployCustomer','DeployJob','GrantAccess','OneShot','ActivateScheduler','PauseScheduler')][string]$Phase = 'Plan',
    [ValidatePattern('^([a-f0-9]{40})?$')][string]$SourceCommit = '',
    [ValidatePattern('^(sha256:[a-f0-9]{64})?$')][string]$ImageDigest = '',
    [string]$RegistryEvidenceFile = ''
)
# OFFLINE ONLY: no execution switch; only local Node/Git/filesystem validation runs.
# Scheduler create has NO paused flag; defer creation until explicit activation approval.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$taskProject = 'sincere-apex-511418-p0'
$taskOperator = 'pete@altovo.com'
$taskRegion = 'asia-southeast1'
$taskCustomer = 'hotel-price-hunter'
$taskWriter = "hotel-price-hunter-runtime@$taskProject.iam.gserviceaccount.com"
$taskWatchWriter = "roomdrop-watch-writer@$taskProject.iam.gserviceaccount.com"
$taskTrigger = "roomdrop-watch-trigger@$taskProject.iam.gserviceaccount.com"
$taskIapAgent = 'service-977401667230@gcp-sa-iap.iam.gserviceaccount.com'
$taskJob = 'roomdrop-price-watch'
$taskScheduler = 'roomdrop-daily-watch'
$taskOrigin = 'https://hotel-price-hunter-2qbcpylngq-as.a.run.app'
$taskRegistry = "$taskRegion-docker.pkg.dev"
$taskImage = "$taskRegistry/$taskProject/hotel-price-hunter/roomdrop"
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskNonce = [guid]::NewGuid().ToString('N')
$taskDockerAuth = Join-Path $taskRoot ".local/roomdrop-docker-auth-$taskNonce"
$taskSource = [ordered]@{ sourceCommit = '<reviewed-clean-40-character-HEAD>'; contextSha256 = '<verified-context-sha256>'; dockerignoreSha256 = '<verified-dockerignore-sha256>'; dockerfileSha256 = '<verified-dockerfile-sha256>'; verifiedCleanLocalSource = $false; verifiedRegistryBytes = $false }
if (([bool]$ImageDigest -ne [bool]$RegistryEvidenceFile) -or ($ImageDigest -and !$SourceCommit)) { throw 'Image digest requires exact reviewed clean source and independently observed registry-byte evidence together.' }
if ($SourceCommit) {
    $taskValidationArguments = @((Join-Path $PSScriptRoot 'roomdrop-source-plan.mjs'), "--source=$SourceCommit")
    if ($ImageDigest) { $taskValidationArguments += @("--digest=$ImageDigest", "--registry-evidence=$RegistryEvidenceFile") }
    $taskPreviousErrorAction = $ErrorActionPreference
    try {
        # Windows PowerShell can turn native stderr into a terminating error even
        # when redirected. Suppress it, then reject using the captured exit code.
        $ErrorActionPreference = 'Continue'
        $taskSourceJson = & node @taskValidationArguments 2>$null
        $taskSourceExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $taskPreviousErrorAction }
    if ($taskSourceExit -ne 0) { throw 'Exact clean source/context or independent registry-byte validation failed. No source or digest guard is bypassed.' }
    $taskObserved = ($taskSourceJson | Out-String) | ConvertFrom-Json
    foreach ($taskKey in @('sourceCommit','contextSha256','dockerignoreSha256','dockerfileSha256')) { $taskSource[$taskKey] = $taskObserved.$taskKey }
    $taskSource.verifiedCleanLocalSource = $true
    $taskSource.verifiedRegistryBytes = [bool]$ImageDigest
}
$taskTag = if ($SourceCommit) { "roomdrop-$($taskSource.sourceCommit.Substring(0,12))-$($taskSource.contextSha256.Substring(0,12))" } else { 'roomdrop-REVIEWED_SOURCE_AND_CONTEXT_REQUIRED' }
$taskDigest = if ($ImageDigest) { $ImageDigest } else { 'sha256:INDEPENDENT_REGISTRY_DIGEST_REQUIRED' }
$taskApproval = 'Prepared only. Separate explicit cloud, API, IAM, image-upload, cost and customer-update approval is required before execution.'
$taskDeployGate = 'STOP unless exact reviewed clean source/context, independent registry manifest/config bytes and digest, fixed target/billing, direct/inherited IAM coverage, no public invoker, agency baseline and existing customer identity/origin are verified; then obtain explicit deployment approval.'
function Cloud-Step([string]$Name, [string[]]$CommandArguments, [string]$Gate = '') {
    return [ordered]@{ name = $Name; program = 'gcloud'; account = $taskOperator; project = $taskProject; region = $taskRegion; arguments = @($CommandArguments) + @("--account=$taskOperator", "--project=$taskProject", '--quiet','--verbosity=error'); gate = $Gate }
}
function Docker-Step([string]$Name, [string[]]$CommandArguments) {
    return [ordered]@{ name = $Name; program = 'docker'; account = $taskOperator; project = $taskProject; region = $taskRegion; arguments = @("--config=$taskDockerAuth") + @($CommandArguments); gate = 'Exact clean source/context required; upload additionally requires explicit approval and nonce-owned isolated registry auth.' }
}
$taskActivationGate = 'DEFERRED: Scheduler must remain ABSENT through rollout acceptance (or PAUSED if already independently observed). Create only AFTER separately approved one-shot execution succeeds, customer signed IAP/data checks and unchanged agency acceptance pass, and explicit recurring activation approval. Creation enables scheduling immediately; never create then pause to seek acceptance.'
$taskActivation = @(
    (Cloud-Step 'Create active daily schedule only after acceptance and explicit activation approval' @('scheduler','jobs','create','http',$taskScheduler,"--location=$taskRegion",'--schedule=0 8 * * *','--time-zone=Asia/Kuala_Lumpur',"--uri=https://run.googleapis.com/v2/projects/$taskProject/locations/$taskRegion/jobs/${taskJob}:run",'--http-method=POST','--headers=Content-Type=application/json','--message-body={}',"--oauth-service-account-email=$taskTrigger",'--oauth-token-scope=https://www.googleapis.com/auth/cloud-platform','--attempt-deadline=30s','--max-retry-attempts=0','--max-retry-duration=0s','--min-backoff=5s','--max-backoff=30s','--max-doublings=0') $taskActivationGate),
    (Cloud-Step 'Verify exact active scheduler target and OAuth configuration' @('scheduler','jobs','describe',$taskScheduler,"--location=$taskRegion",'--format=json') 'Inspect fixed URI, decoded body exactly {}, OAuth trigger identity, no overrides, timezone, schedule, retry count zero and ENABLED state.')
)
$taskPause = @(
    (Cloud-Step 'Pause an independently observed owned scheduler' @('scheduler','jobs','pause',$taskScheduler,"--location=$taskRegion") 'Only after confirming this exact owned scheduler exists; verify PAUSED before any new rollout acceptance.'),
    (Cloud-Step 'Verify scheduler is paused' @('scheduler','jobs','describe',$taskScheduler,"--location=$taskRegion",'--format=json') 'Require state PAUSED. Pause stops future submissions; inspect/cancel any active execution separately with approval.')
)
$taskSteps = [ordered]@{
    Preflight = @(
        (Cloud-Step 'Read fixed project and organization metadata' @('projects','describe',$taskProject,'--format=json') 'Require ACTIVE project number 977401667230 and organization 222849345270; verify billing enabled separately without changing billing.'),
        (Cloud-Step 'Read enabled APIs without enabling anything' @('services','list','--enabled','--format=json') 'Require existing Run, Firestore, Artifact Registry, IAM and IAP APIs; Scheduler enablement alone is proposed separately.'),
        (Cloud-Step 'Read existing immutable registry repository' @('artifacts','repositories','describe','hotel-price-hunter',"--location=$taskRegion",'--format=json') 'Require existing DOCKER repository with immutableTags=true; no replacement repository.'),
        (Cloud-Step 'Read existing Firestore database controls' @('firestore','databases','describe','--database=(default)','--format=json') 'Require FIRESTORE_NATIVE, STANDARD, asia-southeast1, DELETE_PROTECTION_ENABLED; no new database or index proposal.'),
        (Cloud-Step 'Read existing customer before any update' @('run','services','describe',$taskCustomer,"--region=$taskRegion",'--format=json') 'Record exact customer revision/image/configuration/origin and prepare independently reviewed restoration pins.'),
        (Cloud-Step 'Read customer direct invoker policy' @('run','services','get-iam-policy',$taskCustomer,"--region=$taskRegion",'--format=json') 'No allUsers/allAuthenticatedUsers or unexpected direct/inherited invoker grants; resolve access discrepancies before deployment.'),
        (Cloud-Step 'Freeze current agency baseline' @('run','services','describe','hotel-price-hunter-agency',"--region=$taskRegion",'--format=json') 'Record agency image/revision/env/IAM fingerprint; recheck after customer update without relaxing its retained historical verifier.'),
        (Cloud-Step 'Read project direct IAM grants' @('projects','get-iam-policy',$taskProject,'--format=json') 'Inspect existing writer, new writer/trigger, inherited coverage and Scheduler service-agent role; no broad role substitution.'),
        (Cloud-Step 'Inspect any existing scheduler before rollout' @('scheduler','jobs','describe',$taskScheduler,"--location=$taskRegion",'--format=json') 'Only explicit NOT_FOUND establishes absence. Any auth/API/network error blocks this check. If owned existing scheduler is enabled, pause and verify PAUSED before acceptance.'),
        (Cloud-Step 'Read existing customer runtime identity' @('iam','service-accounts','describe',$taskWriter,'--format=json') 'Require exact existing enabled account; never switch customer to agency reader or watch writer.')
    )
    Provision = @(
        (Cloud-Step 'Enable Scheduler API only if independently confirmed absent' @('services','enable','cloudscheduler.googleapis.com') $taskApproval),
        (Cloud-Step 'Create dedicated watch writer only if confirmed absent' @('iam','service-accounts','create','roomdrop-watch-writer','--display-name=RoomDrop simulated watch writer') 'Explicit identity approval; stop on name collision or unexpected existing account.'),
        (Cloud-Step 'Grant project-wide Firestore write access to watch writer' @('projects','add-iam-policy-binding',$taskProject,"--member=serviceAccount:$taskWatchWriter",'--role=roles/datastore.user','--condition=None') 'Explicit IAM approval: project-wide Firestore read/write access to ALL documents, not a collection grant. No model role.'),
        (Cloud-Step 'Create dedicated scheduler trigger only if confirmed absent' @('iam','service-accounts','create','roomdrop-watch-trigger','--display-name=RoomDrop daily watch trigger') 'Explicit identity approval; trigger receives no project data/model role or service-account keys.')
    )
    Build = @(
        (Docker-Step 'Build exact clean reviewed linux amd64 source' @('buildx','build','--platform=linux/amd64','--provenance=false','--load',"--label=org.opencontainers.image.revision=$($taskSource.sourceCommit)","--label=com.roomdrop.build-context.sha256=$($taskSource.contextSha256)","--tag=${taskImage}:$taskTag",$taskRoot)),
        (Cloud-Step 'Capture short-lived fixed-account registry token in memory' @('auth','print-access-token') 'Never print/save token; feed only through stdin to isolated Docker login.'),
        (Docker-Step 'Log in using in-memory token through stdin' @('login',$taskRegistry,'--username=oauth2accesstoken','--password-stdin')),
        (Docker-Step 'Upload approved immutable RoomDrop image tag' @('push',"${taskImage}:$taskTag")),
        (Cloud-Step 'Independently observe uploaded digest' @('artifacts','docker','images','describe',"${taskImage}:$taskTag",'--format=json') 'Independent read-only reviewer must fetch/hash raw registry manifest/config bytes, confirm OCI labels and exact image, no model/credential env; store ignored evidence. Re-run bundle with source, digest and RegistryEvidenceFile. Never deploy a tag.')
    )
    DeployCustomer = @(
        (Cloud-Step 'Update existing customer with private IAP and model-free environment' @('run','deploy',$taskCustomer,"--region=$taskRegion","--image=${taskImage}@$taskDigest","--service-account=$taskWriter",'--iap','--no-allow-unauthenticated','--invoker-iam-check','--ingress=all','--execution-environment=gen2','--port=8080','--cpu=1','--memory=512Mi','--concurrency=4','--min=0','--max=1','--min-instances=0','--max-instances=1','--cpu-throttling','--no-cpu-boost','--timeout=30s',"--set-env-vars=NODE_ENV=production,GOOGLE_CLOUD_PROJECT=$taskProject,APP_SURFACE=customer,APP_ORIGIN=$taskOrigin",'--clear-secrets','--clear-volumes','--clear-volume-mounts','--labels=app=roomdrop,surface=customer') $taskDeployGate),
        (Cloud-Step 'Grant customer invocation only to IAP service agent' @('run','services','add-iam-policy-binding',$taskCustomer,"--region=$taskRegion","--member=serviceAccount:$taskIapAgent",'--role=roles/run.invoker','--condition=None') 'Resource-scoped IAP invoker only; existing unexpected bindings must be resolved explicitly before acceptance.'),
        (Cloud-Step 'Read canonical customer origin and final revision' @('run','services','describe',$taskCustomer,"--region=$taskRegion",'--format=json') 'Require status.url exactly the pinned APP_ORIGIN, exact literal environment/limits/image/identity and Ready latest revision with 100% traffic; agency baseline unchanged.')
    )
    DeployJob = @(
        (Cloud-Step 'Deploy non-running bounded watch job using dedicated writer' @('run','jobs','deploy',$taskJob,"--region=$taskRegion","--image=${taskImage}@$taskDigest","--service-account=$taskWatchWriter",'--tasks=1','--parallelism=1','--max-retries=1','--task-timeout=300s','--cpu=1','--memory=512Mi','--command=node','--args=scripts/run-price-watch-job.mjs',"--set-env-vars=NODE_ENV=production,GOOGLE_CLOUD_PROJECT=$taskProject,PRICE_WATCH_JOB_ENABLED=true,PRICE_WATCH_PROVIDER_MODE=simulated-fixture",'--clear-secrets','--clear-volumes','--clear-volume-mounts','--labels=app=roomdrop,purpose=simulated-watch') $taskDeployGate),
        (Cloud-Step 'Grant trigger only job-scoped invoker' @('run','jobs','add-iam-policy-binding',$taskJob,"--region=$taskRegion","--member=serviceAccount:$taskTrigger",'--role=roles/run.invoker','--condition=None') 'No project-wide run.invoker, datastore, model or run.jobs.runWithOverrides role; verify trigger has no other direct grants.'),
        (Cloud-Step 'Inspect exact job without executing it' @('run','jobs','describe',$taskJob,"--region=$taskRegion",'--format=json') 'Verify exact image/identity/env/command, one task, parallelism one, retry one and 300-second timeout. CLOUD_RUN_JOB is supplied by Cloud Run; never configure reserved runtime variables.')
    )
    GrantAccess = @(
        (Cloud-Step 'Grant only operator access to customer IAP resource' @('iap','web','add-iam-policy-binding','--resource-type=cloud-run',"--service=$taskCustomer","--region=$taskRegion",'--member=user:pete@altovo.com','--role=roles/iap.httpsResourceAccessor','--condition=None') 'Explicit IAP-access approval after metadata/source/privacy checks; examine inherited policy coverage. This is separate from the agency IAP resource.')
    )
    OneShot = @(
        (Cloud-Step 'Run one bounded watch execution only after separate approval' @('run','jobs','execute',$taskJob,"--region=$taskRegion",'--wait') 'Separately approved Firestore writes against fictional fixtures only; scheduler absent/paused. Inspect real execution result and safe counts; success of submission alone is insufficient. No overrides.')
    )
    ActivateScheduler = $taskActivation
    PauseScheduler = $taskPause
}
$taskSelected = [ordered]@{}
foreach ($taskName in @('Preflight','Provision','Build','DeployCustomer','DeployJob','GrantAccess','OneShot','ActivateScheduler','PauseScheduler')) {
    if (($Phase -eq 'Plan' -and $taskName -notin @('OneShot','ActivateScheduler','PauseScheduler')) -or $Phase -eq $taskName) { $taskSelected[$taskName] = $taskSteps[$taskName] }
}
[ordered]@{
    status = 'offline-command-bundle'; executedCloudCommands = 0; account = $taskOperator; project = $taskProject; projectNumber = '977401667230'; region = $taskRegion; approval = $taskApproval
    source = $taskSource; image = @{ repository = $taskImage; tag = $taskTag; digest = $taskDigest; readyForDeploymentReview = [bool]($taskSource.verifiedCleanLocalSource -and $taskSource.verifiedRegistryBytes) }
    identities = @{ customer = $taskWriter; agency = "roomdrop-agency-reader@$taskProject.iam.gserviceaccount.com"; watchWriter = $taskWatchWriter; trigger = $taskTrigger }
    iamBlastRadius = @('Existing customer writer is retained; its historical model permission is not a model-call authorization. No model configuration enters this release.', 'Watch writer roles/datastore.user reads and writes ALL Firestore documents in this project; not a collection-level grant.', 'Trigger receives only roles/run.invoker on roomdrop-price-watch, no Firestore/model role or override permission.', 'IAP service agent receives customer-service roles/run.invoker; only user:pete@altovo.com receives customer resource roles/iap.httpsResourceAccessor. Inherited-policy coverage remains a separate gate.')
    buildAuth = @{ directory = $taskDockerAuth; ownerNonce = $taskNonce; instructions = @('Create only the fresh ignored nonce-owned directory and owner marker before login. Every Docker command uses --config; preserve global Docker config and environment.', 'Use only account-scoped short-lived token in memory and --password-stdin. No service-account keys or ADC changes.', 'Finally verify resolved directory is a direct .local child named roomdrop-docker-auth-<nonce>, no reparse points and matching owner marker; then Remove-Item -LiteralPath that directory -Recurse -Force.') }
    schedule = @{ name = $taskScheduler; expression = '0 8 * * *'; timeZone = 'Asia/Kuala_Lumpur'; beforeAcceptance = 'ABSENT (or independently verified PAUSED if already owned)'; creationDeferredUntil = 'separately approved one-shot plus customer/agency acceptance plus explicit recurring activation approval'; requestBody = '{}'; overrides = $false; triggerRetries = 0; submissionIsProcessingSuccess = $false }
    limits = @{ serviceMin = 0; serviceMax = 1; cpu = 1; memory = '512Mi'; serviceConcurrency = 4; requestTimeoutSeconds = 30; jobTasks = 1; jobParallelism = 1; jobRetries = 1; jobTimeoutSeconds = 300; maxPages = 10; pageSize = 50; spendingCap = 'Resource limits are not a hard spending cap; inspect processing lag and executions. 500 entries per execution does not promise a daily SLA at arbitrary sizes.' }
    phases = $taskSelected; deferredActivation = $taskActivation; stopScheduling = $taskPause
} | ConvertTo-Json -Depth 14
