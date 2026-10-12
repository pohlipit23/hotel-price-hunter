param(
    [switch]$ReadCloud,
    [string]$ProjectId,
    [switch]$AuthorisedProject
)
# Safe default: local prerequisite metadata only. No token output or resource writes.
# Cloud reads: https://docs.cloud.google.com/sdk/gcloud/reference/services/list
# https://docs.cloud.google.com/sdk/gcloud/reference/billing/projects/describe
# https://docs.cloud.google.com/sdk/gcloud/reference/firestore/databases/list
$ErrorActionPreference = 'Stop'
$taskReport = [ordered]@{ checkedAt = [DateTime]::UtcNow.ToString('o'); mode = 'local'; tools = @{}; cloud = @{ status = 'not-attempted' } }
foreach ($taskTool in @('node', 'java', 'docker', 'gcloud', 'firebase')) {
    $taskFound = Get-Command $taskTool -ErrorAction SilentlyContinue
    $taskReport.tools[$taskTool] = [bool]$taskFound
}
$taskAdcPath = if ($env:GOOGLE_APPLICATION_CREDENTIALS) { $env:GOOGLE_APPLICATION_CREDENTIALS } else { Join-Path $env:APPDATA 'gcloud/application_default_credentials.json' }
$taskReport.adcPresent = Test-Path -LiteralPath $taskAdcPath
$taskReport.projectEnvironmentPresent = [bool]$env:GOOGLE_CLOUD_PROJECT
$taskReport.regionEnvironmentPresent = [bool]$env:GOOGLE_CLOUD_LOCATION
$taskReport.javaHomePresent = [bool]$env:JAVA_HOME
$taskReport.firestoreEmulatorConfigured = [bool]$env:FIRESTORE_EMULATOR_HOST
$taskReport.note = 'Installed tools and an ADC file do not establish project authority or live access. Host-only gcloud/Docker checks may be sandbox-blocked.'

function Invoke-TaskGcloudJson([string[]]$CommandArguments) {
    # Capture stderr privately; do not emit account names or remote error text.
    $taskCommandOutput = & gcloud @CommandArguments '--quiet' '--format=json' 2>&1
    $taskCode = $LASTEXITCODE
    if ($taskCode -ne 0) { return @{ status = 'failed'; exitCode = $taskCode } }
    try { return @{ status = 'success'; data = (($taskCommandOutput | Out-String) | ConvertFrom-Json) } }
    catch { return @{ status = 'failed'; reason = 'Could not parse metadata; raw output suppressed.' } }
}

if ($ReadCloud) {
    $taskReport.mode = 'cloud-metadata'
    if (!$AuthorisedProject -or $ProjectId -notmatch '^[a-z][a-z0-9-]{4,28}[a-z0-9]$' -or !$taskReport.tools.gcloud) {
        $taskReport.cloud = @{ status = 'blocked'; reason = 'Supply an explicitly authorised existing ProjectId and installed gcloud. ADC quota project is not automatically selected.' }
    } else {
        $taskReport.cloud = @{ status = 'attempted'; project = $ProjectId; checks = @{} }
        $taskProjectRead = Invoke-TaskGcloudJson -CommandArguments @('projects', 'describe', $ProjectId)
        $taskReport.cloud.checks.project = @{ status = $taskProjectRead.status }
        if ($taskProjectRead.status -eq 'success') {
            $taskReport.cloud.checks.project.lifecycleState = $taskProjectRead.data.lifecycleState
            $taskBilling = Invoke-TaskGcloudJson -CommandArguments @('billing', 'projects', 'describe', $ProjectId)
            $taskReport.cloud.checks.billing = @{ status = $taskBilling.status }
            if ($taskBilling.status -eq 'success') { $taskReport.cloud.checks.billing.enabled = $taskBilling.data.billingEnabled }
            $taskServices = Invoke-TaskGcloudJson -CommandArguments @('services', 'list', '--enabled', "--project=$ProjectId")
            $taskReport.cloud.checks.services = @{ status = $taskServices.status }
            if ($taskServices.status -eq 'success') {
                $taskEnabled = @($taskServices.data | ForEach-Object { $_.config.name })
                $taskReport.cloud.checks.services.enabled = @{}
                foreach ($taskService in @('aiplatform.googleapis.com', 'firestore.googleapis.com', 'run.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com')) {
                    $taskReport.cloud.checks.services.enabled[$taskService] = $taskService -in $taskEnabled
                }
            }
            $taskDatabases = Invoke-TaskGcloudJson -CommandArguments @('firestore', 'databases', 'list', "--project=$ProjectId")
            $taskReport.cloud.checks.firestore = @{ status = $taskDatabases.status }
            if ($taskDatabases.status -eq 'success') {
                $taskReport.cloud.checks.firestore.databases = @($taskDatabases.data | ForEach-Object { @{ location = $_.locationId; type = $_.type } })
            }
            $taskFailed = @($taskReport.cloud.checks.Values | Where-Object { $_.status -ne 'success' }).Count
            $taskReport.cloud.status = if ($taskFailed) { 'failed' } else { 'success' }
        } else { $taskReport.cloud.status = 'failed' }
    }
}
$taskReport | ConvertTo-Json -Depth 8
