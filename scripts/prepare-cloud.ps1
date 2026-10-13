[CmdletBinding()]
param(
    [ValidateSet('Plan', 'Provision', 'BuildImage', 'DeployPrivate', 'Publish', 'DisablePublic')]
    [string]$Phase = 'Plan',
    [switch]$Execute,
    [switch]$TrialConfirmed,
    [switch]$PrivateVerificationPassed,
    [ValidatePattern('^(hotel-price-hunter-[a-z0-9-]+)?$')]
    [string]$VerifiedRevision = '',
    [string]$ApprovalReference,
    [ValidatePattern('^[a-z0-9][a-z0-9_.-]{0,127}$')]
    [string]$ImageTag = 'milestone-20261013',
    [ValidatePattern('^(sha256:[a-f0-9]{64})?$')]
    [string]$ImageDigest = ''
)

# Preparation is offline by default. Nothing below invokes gcloud/Docker without -Execute.
# Target values are deliberate: never infer a project from CLI defaults or local ADC.
# -Execute is an operator action AFTER approval; this file does not grant authority.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$taskProject = 'sincere-apex-511418-p0'
$taskProjectNumber = '977401667230'
$taskRegion = 'asia-southeast1'
$taskService = 'hotel-price-hunter'
$taskRepository = 'hotel-price-hunter'
$taskAccountId = 'hotel-price-hunter-runtime'
$taskRuntimeAccount = "$taskAccountId@$taskProject.iam.gserviceaccount.com"
$taskPredictRoleId = 'hotelPriceHunterPredict'
$taskPredictRole = "projects/$taskProject/roles/$taskPredictRoleId"
$taskModel = 'gemini-3.1-flash-lite'
$taskModelLocation = 'global'
$taskRegistryHost = "$taskRegion-docker.pkg.dev"
$taskImageBase = "$taskRegistryHost/$taskProject/$taskRepository/app"
$taskImageTagReference = "${taskImageBase}:$ImageTag"
$taskDigestReference = if ($ImageDigest) { "${taskImageBase}@$ImageDigest" } else { "${taskImageBase}@sha256:<registry-digest-required>" }
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskApis = @('run.googleapis.com', 'firestore.googleapis.com', 'artifactregistry.googleapis.com', 'aiplatform.googleapis.com', 'iam.googleapis.com', 'cloudresourcemanager.googleapis.com')

function Format-TaskArgument([string]$Value) { return "'" + $Value.Replace("'", "''") + "'" }
function Show-TaskCommand([string]$Program, [string[]]$CommandArguments) {
    $taskQuoted = @($CommandArguments | ForEach-Object { Format-TaskArgument $_ })
    Write-Output ($Program + ' ' + ($taskQuoted -join ' '))
}
function Invoke-TaskCommand([string]$Program, [string[]]$CommandArguments, [switch]$Capture) {
    Show-TaskCommand $Program $CommandArguments | Write-Host
    $taskResult = & $Program @CommandArguments 2>$null
    $taskExit = $LASTEXITCODE
    if ($taskExit -ne 0) { throw "$Program failed in $Phase (exit $taskExit). Remote output is suppressed; stop and resolve the specific prerequisite without broadening permissions." }
    if ($Capture) { return ($taskResult | Out-String).Trim() }
}
function Read-TaskJson([string[]]$CommandArguments) {
    $taskJson = Invoke-TaskCommand 'gcloud' ($CommandArguments + @('--quiet', '--verbosity=error', '--format=json')) -Capture
    try { return ConvertFrom-Json -InputObject $taskJson }
    catch { throw 'Metadata response could not be parsed. Stop; no inferred resource state is allowed.' }
}
function Assert-TaskPredictRole {
    $taskPermissions = @(Read-TaskJson @('iam', 'list-testable-permissions', "//cloudresourcemanager.googleapis.com/projects/$taskProject", '--filter=name:aiplatform.endpoints.predict OR name:serviceusage.services.use', "--project=$taskProject"))
    foreach ($taskRequiredPermission in @('aiplatform.endpoints.predict', 'serviceusage.services.use')) {
        $taskPermission = @($taskPermissions | Where-Object { $_.name -eq $taskRequiredPermission })
        if ($taskPermission.Count -ne 1 -or $taskPermission[0].stage -ne 'GA') { throw 'Required inference permission support is missing or unverified.' }
        # SUPPORTED is the documented default enum when this field is omitted.
        if ($taskPermission[0].PSObject.Properties['customRolesSupportLevel'] -and $taskPermission[0].customRolesSupportLevel -ne 'SUPPORTED') { throw 'Required inference permission is not supported in this custom role.' }
        if ($taskPermission[0].PSObject.Properties['apiDisabled'] -and $taskPermission[0].apiDisabled) { throw 'Inference API is still disabled; stop and resolve propagation before role creation.' }
    }
}
function Assert-TaskRuntimeAuthority {
    $taskAccount = Read-TaskJson @('iam', 'service-accounts', 'describe', $taskRuntimeAccount, "--project=$taskProject")
    if ($taskAccount.email -ne $taskRuntimeAccount -or $taskAccount.displayName -ne 'Hotel Price Hunter runtime' -or ($taskAccount.PSObject.Properties['disabled'] -and $taskAccount.disabled)) { throw 'Runtime identity metadata differs from the reviewed app account.' }
    $taskPolicy = Read-TaskJson @('projects', 'get-iam-policy', $taskProject)
    $taskBindings = if ($taskPolicy.PSObject.Properties['bindings']) { @($taskPolicy.bindings) } else { @() }
    $taskRuntimeRoles = @()
    foreach ($taskBinding in $taskBindings) {
        if ("serviceAccount:$taskRuntimeAccount" -in @($taskBinding.members)) {
            if ($taskBinding.role -notin @('roles/datastore.user', $taskPredictRole) -or $taskBinding.PSObject.Properties['condition']) { throw 'Runtime account has unrelated or conditional direct project grants; stop for review.' }
            $taskRuntimeRoles += $taskBinding.role
        }
    }
    if ((($taskRuntimeRoles | Sort-Object -Unique) -join ',') -ne ((@('roles/datastore.user', $taskPredictRole) | Sort-Object) -join ',')) { throw 'Both exact reviewed runtime roles must be present before deployment/publication.' }
    $taskRole = Read-TaskJson @('iam', 'roles', 'describe', $taskPredictRoleId, "--project=$taskProject")
    if ((($taskRole.includedPermissions | Sort-Object) -join ',') -ne 'aiplatform.endpoints.predict,serviceusage.services.use' -or $taskRole.stage -ne 'GA' -or ($taskRole.PSObject.Properties['deleted'] -and $taskRole.deleted)) { throw 'Runtime inference role no longer matches the reviewed exact permissions.' }
}
function Assert-TaskTarget([switch]$SkipBilling) {
    $taskProjectRead = Read-TaskJson @('projects', 'describe', $taskProject)
    if ($taskProjectRead.projectId -ne $taskProject -or [string]$taskProjectRead.projectNumber -ne $taskProjectNumber -or $taskProjectRead.lifecycleState -ne 'ACTIVE') { throw 'Project metadata does not match the approved fixed project.' }
    if (!$SkipBilling) {
        $taskBillingRead = Read-TaskJson @('billing', 'projects', 'describe', $taskProject)
        if ($taskBillingRead.billingEnabled -ne $true) { throw 'Project billing is not enabled. This script never links billing or performs a paid upgrade.' }
    }
}
function Assert-TaskBuildContext {
    # Allow only the reviewed application context; do not use source deployment or mount ADC.
    $taskExpectedIgnore = @('**', '!package.json', '!package-lock.json', '!app/', '!app/**', '!fixtures/', '!fixtures/jury-booking.json') -join "`n"
    $taskActualIgnore = ((Get-Content -LiteralPath (Join-Path $taskRoot '.dockerignore')) | ForEach-Object { $_.Trim() } | Where-Object { $_ }) -join "`n"
    if ($taskActualIgnore -ne $taskExpectedIgnore) { throw 'Docker context allowlist changed; review it before uploading an image.' }
    $taskSensitivePaths = @(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'app') -Recurse -File | Where-Object { $_.Name -match '^\.env($|\.)|credentials?|^application_default|\.(pem|key|p12|pfx)$' })
    if ($taskSensitivePaths.Count) { throw 'A credential-like file exists under the allowed app context. Stop; no upload is permitted.' }
    $taskFixture = Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'fixtures/jury-booking.json') | ConvertFrom-Json
    if ($taskFixture.scenarioId -ne 'jury-booking' -or $taskFixture.isFictional -ne $true -or $taskFixture.mode -ne 'public-jury' -or $taskFixture.booking.bookingId -notlike 'DEMO_*') { throw 'The uploaded fixture must be the explicitly anonymised public jury scenario.' }
    if ($taskFixture.PSObject.Properties['customer']) { throw 'Customer identity cannot enter the public image.' }
}
function Get-TaskService {
    return Read-TaskJson @('run', 'services', 'describe', $taskService, "--project=$taskProject", "--region=$taskRegion")
}
function Get-TaskOrigin($Service) {
    $taskAddress = [uri]$Service.status.url
    if ($taskAddress.Scheme -ne 'https' -or $taskAddress.Host -notmatch '\.run\.app$' -or $taskAddress.AbsolutePath -ne '/' -or $taskAddress.UserInfo -or $taskAddress.Query -or $taskAddress.Fragment) { throw 'Cloud Run returned an unexpected canonical URL; stop instead of weakening APP_ORIGIN.' }
    return $taskAddress.GetLeftPart([System.UriPartial]::Authority)
}
function Assert-TaskServiceConfiguration($Service, [switch]$Full) {
    $taskPod = $Service.spec.template.spec
    if ($taskPod.serviceAccountName -ne $taskRuntimeAccount -or @($taskPod.containers).Count -ne 1) { throw 'Service must use the reviewed identity and exactly one application container.' }
    if ($taskPod.PSObject.Properties['volumes'] -and @($taskPod.volumes).Count) { throw 'Existing service has volumes; credential/ADC mounts are not in this deployment scope.' }
    $taskContainer = $taskPod.containers[0]
    if ($taskContainer.PSObject.Properties['volumeMounts'] -and @($taskContainer.volumeMounts).Count) { throw 'Container mounts are outside the reviewed configuration.' }
    $taskEnvironment = if ($taskContainer.PSObject.Properties['env']) { @($taskContainer.env) } else { @() }
    $taskAllowedEnvironment = @('NODE_ENV', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'GEMINI_MODEL', 'APP_ORIGIN')
    foreach ($taskVariable in $taskEnvironment) {
        if ($taskVariable.name -notin $taskAllowedEnvironment -or $taskVariable.PSObject.Properties['valueFrom'] -or !$taskVariable.PSObject.Properties['value']) { throw 'Secret-sourced, forbidden or unrecognised environment variables are outside the reviewed configuration.' }
    }
    if ($Full) {
        $taskExpected = @{ NODE_ENV = 'production'; GOOGLE_CLOUD_PROJECT = $taskProject; GOOGLE_CLOUD_LOCATION = $taskModelLocation; GEMINI_MODEL = $taskModel; APP_ORIGIN = (Get-TaskOrigin $Service) }
        if ($taskEnvironment.Count -ne $taskExpected.Count) { throw 'Production environment must contain exactly the known non-secret values.' }
        foreach ($taskKey in $taskExpected.Keys) {
            if (@($taskEnvironment | Where-Object { $_.name -eq $taskKey -and $_.value -eq $taskExpected[$taskKey] }).Count -ne 1) { throw 'Production environment differs from the exact reviewed values.' }
        }
    }
}
function Assert-TaskPrivate($Service) {
    if ($Service.metadata.PSObject.Properties['annotations']) {
        $taskAnnotations = $Service.metadata.annotations
        if ($taskAnnotations -and $taskAnnotations.PSObject.Properties['run.googleapis.com/invoker-iam-disabled'] -and $taskAnnotations.'run.googleapis.com/invoker-iam-disabled' -eq 'true') { throw 'Invoker IAM is disabled. Stop; a public service cannot be used as the private deployment stage.' }
    }
    $taskPolicy = Read-TaskJson @('run', 'services', 'get-iam-policy', $taskService, "--project=$taskProject", "--region=$taskRegion")
    $taskBindings = if ($taskPolicy.PSObject.Properties['bindings']) { @($taskPolicy.bindings) } else { @() }
    foreach ($taskBinding in $taskBindings) {
        if ($taskBinding.role -eq 'roles/run.invoker' -and @($taskBinding.members | Where-Object { $_ -in @('allUsers', 'allAuthenticatedUsers') }).Count) { throw 'Service already has broad invocation access; do not overwrite or silently privatise it.' }
    }
}
function Remove-TaskDockerConfig([string]$Directory, [string]$OwnerNonce) {
    $taskResolvedAuth = [IO.Path]::GetFullPath($Directory)
    $taskAuthParent = [IO.Path]::GetFullPath((Join-Path $taskRoot '.local'))
    if ((Split-Path -Parent $taskResolvedAuth) -ne $taskAuthParent -or (Split-Path -Leaf $taskResolvedAuth) -notmatch '^cloud-docker-auth-[a-f0-9-]+$') { throw 'Refusing cleanup outside the task-owned workspace auth directory.' }
    foreach ($taskDirectory in @($taskAuthParent, $taskResolvedAuth)) {
        if ((Get-Item -LiteralPath $taskDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing task auth cleanup through a reparse point.' }
    }
    $taskMarker = Join-Path $taskResolvedAuth 'hph-owner.txt'
    if (!(Test-Path -LiteralPath $taskMarker) -or (Get-Content -Raw -LiteralPath $taskMarker).Trim() -ne $OwnerNonce) { throw 'Auth cleanup ownership marker is absent or mismatched.' }
    Remove-Item -LiteralPath $taskResolvedAuth -Recurse -Force
}
function Get-TaskDeploymentArguments([string]$Digest, [string]$Origin) {
    return @('run', 'deploy', $taskService, "--project=$taskProject", "--region=$taskRegion", "--image=$Digest", "--service-account=$taskRuntimeAccount",
        '--no-allow-unauthenticated', '--invoker-iam-check', '--ingress=all', '--execution-environment=gen2', '--port=8080', '--cpu=1', '--memory=512Mi',
        '--concurrency=4', '--min=0', '--max=1', '--max-instances=1', '--cpu-throttling', '--no-cpu-boost', '--timeout=30s',
        "--set-env-vars=NODE_ENV=production,GOOGLE_CLOUD_PROJECT=$taskProject,GOOGLE_CLOUD_LOCATION=$taskModelLocation,GEMINI_MODEL=$taskModel,APP_ORIGIN=$Origin",
        '--labels=app=hotel-price-hunter,mode=public-jury', '--quiet', '--verbosity=error')
}

Write-Output "Hotel Price Hunter deployment proposal: $taskProject ($taskProjectNumber), $taskRegion; Vertex $taskModelLocation / $taskModel."
Write-Output 'No trial credit, model availability, deployed state or approval is inferred from this proposal.'
if (!$Execute) {
    Write-Output 'DRY RUN: no gcloud, Docker, network, credential, filesystem or cloud mutations are executed.'
    $taskPhases = if ($Phase -eq 'Plan') { @('Provision', 'BuildImage', 'DeployPrivate', 'Publish', 'DisablePublic') } else { @($Phase) }
    foreach ($taskStage in $taskPhases) {
        Write-Output "`n[$taskStage - requires its own approved execution]"
        switch ($taskStage) {
            'Provision' {
                Show-TaskCommand 'gcloud' (@('services', 'enable') + $taskApis + @("--project=$taskProject", '--quiet'))
                Write-Output '# After successful API enablement: list resources, reuse only matching reviewed resources; create only if absent.'
                Show-TaskCommand 'gcloud' @('firestore', 'databases', 'create', '--database=(default)', '--type=firestore-native', '--edition=standard', "--location=$taskRegion", '--delete-protection', "--project=$taskProject", '--quiet')
                Show-TaskCommand 'gcloud' @('artifacts', 'repositories', 'create', $taskRepository, '--repository-format=docker', "--location=$taskRegion", '--immutable-tags', '--labels=app=hotel-price-hunter', "--project=$taskProject", '--quiet')
                Show-TaskCommand 'gcloud' @('iam', 'service-accounts', 'create', $taskAccountId, '--display-name=Hotel Price Hunter runtime', "--project=$taskProject", '--quiet')
                Show-TaskCommand 'gcloud' @('iam', 'list-testable-permissions', "//cloudresourcemanager.googleapis.com/projects/$taskProject", '--filter=name:aiplatform.endpoints.predict OR name:serviceusage.services.use', "--project=$taskProject", '--format=json')
                Write-Output '# Require both permissions GA, API enabled, and custom-role supported before creation.'
                Show-TaskCommand 'gcloud' @('iam', 'roles', 'create', $taskPredictRoleId, "--project=$taskProject", '--title=Hotel Price Hunter fixture advice', '--permissions=aiplatform.endpoints.predict,serviceusage.services.use', '--stage=GA', '--quiet')
                foreach ($taskRole in @('roles/datastore.user', $taskPredictRole)) { Show-TaskCommand 'gcloud' @('projects', 'add-iam-policy-binding', $taskProject, "--member=serviceAccount:$taskRuntimeAccount", "--role=$taskRole", '--condition=None', '--quiet') }
            }
            'BuildImage' {
                Write-Output '# Local context allowlist/sanitisation checks run before any image upload; tag is immutable.'
                Write-Output '# Execute uses a fresh ignored .local/cloud-docker-auth-<nonce> DOCKER_CONFIG, restores the original environment and removes task-owned auth material in finally.'
                Show-TaskCommand 'gcloud' @('auth', 'configure-docker', $taskRegistryHost, '--quiet')
                Show-TaskCommand 'docker' @('build', '--platform=linux/amd64', '-t', $taskImageTagReference, '.')
                Show-TaskCommand 'docker' @('push', $taskImageTagReference)
                Show-TaskCommand 'gcloud' @('artifacts', 'docker', 'images', 'describe', $taskImageTagReference, "--project=$taskProject", '--format=json')
                Write-Output '# Record image_summary.digest; pass its sha256 value to DeployPrivate. Never deploy an unverified tag or latest.'
            }
            'DeployPrivate' {
                Write-Output '# Inspect service IAM first; an existing public/name-colliding service causes execution to stop.'
                Show-TaskCommand 'gcloud' (Get-TaskDeploymentArguments $taskDigestReference 'https://origin-not-ready.invalid')
                Show-TaskCommand 'gcloud' @('run', 'services', 'describe', $taskService, "--project=$taskProject", "--region=$taskRegion", '--format=value(status.url)')
                Write-Output '# Validate returned HTTPS *.run.app origin. Then update APP_ORIGIN to that exact canonical origin while still requiring IAM.'
                Show-TaskCommand 'gcloud' @('run', 'services', 'update', $taskService, "--project=$taskProject", "--region=$taskRegion", '--invoker-iam-check', '--update-env-vars=APP_ORIGIN=<validated-status.url-origin>', '--quiet')
                Write-Output '# STOP for private verification. No public binding or model request occurs in this phase.'
            }
            'Publish' {
                Write-Output '# Separate public-access approval, ImageDigest, VerifiedRevision and PrivateVerificationPassed are required; validate the exact ready revision, 100% traffic, APP_ORIGIN and identity first.'
                Show-TaskCommand 'gcloud' @('run', 'services', 'add-iam-policy-binding', $taskService, "--project=$taskProject", "--region=$taskRegion", '--member=allUsers', '--role=roles/run.invoker', '--quiet')
            }
            'DisablePublic' {
                Write-Output '# Explicit authorised containment: remove only this service public invocation; keep state/resources.'
                Show-TaskCommand 'gcloud' @('run', 'services', 'remove-iam-policy-binding', $taskService, "--project=$taskProject", "--region=$taskRegion", '--member=allUsers', '--role=roles/run.invoker', '--quiet')
            }
        }
    }
    return
}

if ($Phase -eq 'Plan') { throw 'Plan is offline only. Choose one approved execution phase explicitly.' }
if ([string]::IsNullOrWhiteSpace($ApprovalReference)) { throw 'Execution requires an explicit user approval reference. This file does not grant approval.' }
if ($Phase -ne 'DisablePublic' -and !$TrialConfirmed) { throw 'Execution requires verified eligible active trial/remaining credits. No billing upgrade is performed.' }
if ($Phase -eq 'Publish' -and (!$PrivateVerificationPassed -or !$VerifiedRevision)) { throw 'Publishing requires completed private verification bound to VerifiedRevision and separate public access approval.' }
if ($Phase -in @('DeployPrivate', 'Publish') -and !$ImageDigest) { throw 'Deployment/publication requires the reviewed Artifact Registry sha256 ImageDigest.' }
Assert-TaskTarget -SkipBilling:($Phase -eq 'DisablePublic')
Push-Location -LiteralPath $taskRoot
try {
    switch ($Phase) {
        'Provision' {
            Invoke-TaskCommand 'gcloud' (@('services', 'enable') + $taskApis + @("--project=$taskProject", '--quiet', '--verbosity=error'))
            $taskDatabases = @(Read-TaskJson @('firestore', 'databases', 'list', "--project=$taskProject"))
            $taskDatabase = @($taskDatabases | Where-Object { $_.name -eq "projects/$taskProject/databases/(default)" })
            if ($taskDatabase.Count) {
                if ($taskDatabase[0].locationId -ne $taskRegion -or $taskDatabase[0].type -ne 'FIRESTORE_NATIVE' -or $taskDatabase[0].databaseEdition -ne 'STANDARD' -or $taskDatabase[0].deleteProtectionState -ne 'DELETE_PROTECTION_ENABLED') { throw 'Existing default database does not match native/Standard/Singapore/delete-protected selection; missing metadata is not proof.' }
            } else { Invoke-TaskCommand 'gcloud' @('firestore', 'databases', 'create', '--database=(default)', '--type=firestore-native', '--edition=standard', "--location=$taskRegion", '--delete-protection', "--project=$taskProject", '--quiet', '--verbosity=error') }
            $taskRepositories = @(Read-TaskJson @('artifacts', 'repositories', 'list', "--project=$taskProject", "--location=$taskRegion"))
            $taskRepositoryMatch = @($taskRepositories | Where-Object { $_.name -eq "projects/$taskProject/locations/$taskRegion/repositories/$taskRepository" })
            if ($taskRepositoryMatch.Count) {
                if ($taskRepositoryMatch[0].format -ne 'DOCKER' -or $taskRepositoryMatch[0].dockerConfig.immutableTags -ne $true) { throw 'Existing repository differs from the approved immutable Docker repository.' }
            } else { Invoke-TaskCommand 'gcloud' @('artifacts', 'repositories', 'create', $taskRepository, '--repository-format=docker', "--location=$taskRegion", '--immutable-tags', '--labels=app=hotel-price-hunter', "--project=$taskProject", '--quiet', '--verbosity=error') }
            $taskAccounts = @(Read-TaskJson @('iam', 'service-accounts', 'list', "--project=$taskProject"))
            $taskAccountMatch = @($taskAccounts | Where-Object { $_.email -eq $taskRuntimeAccount })
            if ($taskAccountMatch.Count) {
                if ($taskAccountMatch[0].displayName -ne 'Hotel Price Hunter runtime' -or ($taskAccountMatch[0].PSObject.Properties['disabled'] -and $taskAccountMatch[0].disabled)) { throw 'Existing runtime account does not match the reviewed app identity.' }
            } else { Invoke-TaskCommand 'gcloud' @('iam', 'service-accounts', 'create', $taskAccountId, '--display-name=Hotel Price Hunter runtime', "--project=$taskProject", '--quiet', '--verbosity=error') }
            $taskRoles = @(Read-TaskJson @('iam', 'roles', 'list', "--project=$taskProject"))
            Assert-TaskPredictRole
            if (@($taskRoles | Where-Object { $_.name -eq $taskPredictRole }).Count) {
                $taskRoleRead = Read-TaskJson @('iam', 'roles', 'describe', $taskPredictRoleId, "--project=$taskProject")
                if ((($taskRoleRead.includedPermissions | Sort-Object) -join ',') -ne 'aiplatform.endpoints.predict,serviceusage.services.use' -or $taskRoleRead.stage -ne 'GA' -or ($taskRoleRead.PSObject.Properties['deleted'] -and $taskRoleRead.deleted)) { throw 'Existing inference role differs; do not broaden or overwrite it.' }
            } else { Invoke-TaskCommand 'gcloud' @('iam', 'roles', 'create', $taskPredictRoleId, "--project=$taskProject", '--title=Hotel Price Hunter fixture advice', '--permissions=aiplatform.endpoints.predict,serviceusage.services.use', '--stage=GA', '--quiet', '--verbosity=error') }
            $taskProjectPolicy = Read-TaskJson @('projects', 'get-iam-policy', $taskProject)
            $taskProjectBindings = if ($taskProjectPolicy.PSObject.Properties['bindings']) { @($taskProjectPolicy.bindings) } else { @() }
            foreach ($taskBinding in $taskProjectBindings) {
                if ("serviceAccount:$taskRuntimeAccount" -in @($taskBinding.members) -and $taskBinding.role -notin @('roles/datastore.user', $taskPredictRole)) { throw 'Runtime account already has unrelated project roles; stop and review its ownership/permissions.' }
            }
            foreach ($taskRole in @('roles/datastore.user', $taskPredictRole)) { Invoke-TaskCommand 'gcloud' @('projects', 'add-iam-policy-binding', $taskProject, "--member=serviceAccount:$taskRuntimeAccount", "--role=$taskRole", '--condition=None', '--quiet', '--verbosity=error') }
            Assert-TaskRuntimeAuthority
        }
        'BuildImage' {
            Assert-TaskBuildContext
            $taskAuthNonce = [guid]::NewGuid().ToString()
            $taskAuthDirectory = Join-Path $taskRoot ".local/cloud-docker-auth-$taskAuthNonce"
            $taskPriorDockerConfig = $env:DOCKER_CONFIG
            $taskAuthParent = Join-Path $taskRoot '.local'
            if ((Test-Path -LiteralPath $taskAuthParent) -and ((Get-Item -LiteralPath $taskAuthParent).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Task auth parent must not be a reparse point.' }
            New-Item -ItemType Directory -Path $taskAuthDirectory -Force | Out-Null
            Set-Content -LiteralPath (Join-Path $taskAuthDirectory 'hph-owner.txt') -Value $taskAuthNonce -NoNewline
            try {
                $env:DOCKER_CONFIG = $taskAuthDirectory
                Invoke-TaskCommand 'gcloud' @('auth', 'configure-docker', $taskRegistryHost, "--project=$taskProject", '--quiet', '--verbosity=error')
                Invoke-TaskCommand 'docker' @('build', '--platform=linux/amd64', '-t', $taskImageTagReference, '.')
                Invoke-TaskCommand 'docker' @('push', $taskImageTagReference)
                $taskImageRead = Read-TaskJson @('artifacts', 'docker', 'images', 'describe', $taskImageTagReference, "--project=$taskProject")
                $taskDigest = $taskImageRead.image_summary.digest
                if ($taskDigest -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Artifact Registry did not return a usable immutable image digest.' }
                Write-Output "Reviewed deployment image: ${taskImageBase}@$taskDigest"
            } finally {
                $env:DOCKER_CONFIG = $taskPriorDockerConfig
                Remove-TaskDockerConfig $taskAuthDirectory $taskAuthNonce
            }
        }
        'DeployPrivate' {
            Assert-TaskRuntimeAuthority
            $taskServices = @(Read-TaskJson @('run', 'services', 'list', "--project=$taskProject", "--region=$taskRegion"))
            if (@($taskServices | Where-Object { $_.metadata.name -eq $taskService }).Count) {
                $taskExisting = Get-TaskService
                Assert-TaskPrivate $taskExisting
                Assert-TaskServiceConfiguration $taskExisting
            }
            $taskImageRead = Read-TaskJson @('artifacts', 'docker', 'images', 'describe', $taskDigestReference, "--project=$taskProject")
            if ($taskImageRead.image_summary.digest -ne $ImageDigest) { throw 'Artifact digest verification differs from the reviewed digest.' }
            Invoke-TaskCommand 'gcloud' (Get-TaskDeploymentArguments $taskDigestReference 'https://origin-not-ready.invalid')
            $taskPrivate = Get-TaskService
            Assert-TaskPrivate $taskPrivate
            $taskOrigin = Get-TaskOrigin $taskPrivate
            Invoke-TaskCommand 'gcloud' @('run', 'services', 'update', $taskService, "--project=$taskProject", "--region=$taskRegion", '--invoker-iam-check', "--update-env-vars=APP_ORIGIN=$taskOrigin", '--quiet', '--verbosity=error')
            $taskConfigured = Get-TaskService
            Assert-TaskPrivate $taskConfigured
            Assert-TaskServiceConfiguration $taskConfigured -Full
            Write-Output "Private deployment origin configured: $taskOrigin. STOP for verification and public approval."
        }
        'Publish' {
            Assert-TaskRuntimeAuthority
            $taskReady = Get-TaskService
            Assert-TaskPrivate $taskReady
            Assert-TaskServiceConfiguration $taskReady -Full
            $taskOrigin = Get-TaskOrigin $taskReady
            if ($taskReady.status.latestReadyRevisionName -ne $VerifiedRevision -or $taskReady.status.latestCreatedRevisionName -ne $VerifiedRevision -or
                !@($taskReady.status.conditions | Where-Object { $_.type -eq 'Ready' -and $_.status -eq 'True' }).Count) { throw 'The latest ready revision changed or is not ready; repeat private verification.' }
            $taskActiveTraffic = @($taskReady.status.traffic | Where-Object { $_.PSObject.Properties['percent'] -and $_.percent -gt 0 })
            if ($taskActiveTraffic.Count -ne 1 -or $taskActiveTraffic[0].percent -ne 100 -or $taskActiveTraffic[0].revisionName -ne $VerifiedRevision) { throw 'Verified revision must receive exactly 100% of service traffic before publishing.' }
            if ($taskReady.spec.template.spec.containers[0].image -ne $taskDigestReference) { throw 'The deployed image differs from the verified immutable digest.' }
            $taskEnvironment = @($taskReady.spec.template.spec.containers[0].env)
            if (@($taskEnvironment | Where-Object { $_.name -eq 'APP_ORIGIN' -and $_.value -eq $taskOrigin }).Count -ne 1 -or $taskReady.spec.template.spec.serviceAccountName -ne $taskRuntimeAccount) { throw 'Exact canonical APP_ORIGIN and approved runtime identity must be verified before public access.' }
            Invoke-TaskCommand 'gcloud' @('run', 'services', 'add-iam-policy-binding', $taskService, "--project=$taskProject", "--region=$taskRegion", '--member=allUsers', '--role=roles/run.invoker', '--quiet', '--verbosity=error')
            Write-Output "Public jury entry point: $taskOrigin. Verify anonymously; no model call was made by this script."
        }
        'DisablePublic' {
            Invoke-TaskCommand 'gcloud' @('run', 'services', 'remove-iam-policy-binding', $taskService, "--project=$taskProject", "--region=$taskRegion", '--member=allUsers', '--role=roles/run.invoker', '--quiet', '--verbosity=error')
        }
    }
} finally { Pop-Location }
