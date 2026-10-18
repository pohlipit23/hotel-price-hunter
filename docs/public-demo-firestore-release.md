# Curated RoomDrop Part 2 release preparation

Status: implementation against storage contract v1 is committed locally;
integrated acceptance and a production release candidate are blocked on Part 1
integration. No deployment/import/publication approval is requested yet. The
reviewed catalogue content and exact production image are not ready to approve.

The hosted booking and quotation entrypoints require server Firestore storage,
the canonical customer deployment profile and a reviewed code/version manifest.
They never seed/import or fall back to packaged booking facts or memory on storage
failure. The current worktree lacks Part 1's session/booking modules, so default
startup fails with a bounded diagnostic before listening. Injected test factories
are explicit programmatic dependencies; no production environment switch enables
test storage. GET/watch integration still requires Part 1's implementation.

## Finish locally before requesting release approval

1. Obtain the user's go-ahead to integrate Part 1. Preserve both branches and
   unrelated shared-checkout work; reconcile only the agreed ownership sections.
2. Wire Part 1's durable GET/watch and bootstrap projection
   `publicPostWatchState({ scope, bundle })`. Keep its atomic arm receipt unchanged.
3. Run all Node and browser/emulator gates in the Part 2 verification document.
4. Complete the owner-created six-scenario matrix with separately authorised
   captures. Synthetic fixtures prove mechanics only.
5. From actual reviewed Firestore/import dry-run output, save only this shape in
   ignored `.local\reviewed-catalogue-manifest.json`:

```json
{"schemaVersion":1,"entries":[{"code":"OWNER_APPROVED_CODE","contentVersion":"VERIFIED_CONTENT_HASH","dropSetVersion":"VERIFIED_DROP_SET_HASH"}]}
```

The example is a schema illustration, not an executable or approved catalogue.
Pins must match `loadHostedCatalogue` exactly. No hotel facts, raw captures,
credentials, supplier references or judge state are packaged in that manifest.

```powershell
Set-Location 'C:\Users\pohli\Sites\hotel-price-hunter\.local\roomdrop-part2'
$sourceCommit = (git rev-parse HEAD).Trim()
node scripts\prepare-booking-release.mjs --prepare "--source=$sourceCommit" --manifest=.local\reviewed-catalogue-manifest.json
# Use the returned manifestPath, then verify every hash before building.
$bundle = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($bundle.sourceMode -ne 'git-commit' -or -not $bundle.uncommittedFilesExcluded) { throw 'Test source cannot be released' }
docker build --tag $bundle.localImageTag $bundle.contextDirectory
docker image inspect $bundle.localImageTag --format '{{.Id}}'
```

Preparation reads only the exact commit's files and recursively closes static
module dependencies. Missing Part 1 source fails `SOURCE_DEPENDENCY_MISSING`.
Explicit test-source injection yields `test-prepared-offline`, a
`roomdrop-booking-test` tag, `sourceMode:test-injected` and no registry destination.
Those artifacts cannot serve as release lineage.

`Dockerfile.booking` copies only `booking-catalogue-manifest.json`; the old
`--snapshot`/`--catalogue` release arguments are rejected. Preserve the legacy
single-snapshot UI regression as separate historical evidence, not the hosted
curated runtime. The older quotation release script/Docker context is not the
curated release path; both new hosted entrypoints are included in this booking
context's dependency closure.

## Emulator import and local ports

The existing Part 2 emulator is already running. Do not start Java/gcloud or use
`npm run emulator`. Once Part 1 is integrated, its guarded importer can validate
and seed only reviewed test-owned content in the local emulator:

```powershell
$env:GOOGLE_CLOUD_PROJECT='demo-roomdrop-part2'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8281'
node scripts\import-altovo-catalogue.mjs --catalogue=tests\fixtures\curated-bookings.json
node scripts\import-altovo-catalogue.mjs --catalogue=tests\fixtures\curated-bookings.json --execute --project=demo-roomdrop-part2 '--database=(default)' --emulator=127.0.0.1:8281
```

Use 8294 for a manual booking server, 8293 for quotation, and `PORT=8290` plus
`APP_ORIGIN=http://127.0.0.1:8290` for the separate `app/server.mjs` simulation.
Browser harnesses use port 0. Never operate the Part 1 or 8081 containers.

## Separate live approval packet still required

Before approval, refresh the current customer revision, runtime image digest and
complete service configuration; the agency's private IAP boundary; project IAM;
Firestore shared/session/simulation data preservation; and Scheduler state.
Record exact before-state hashes and retain the previous customer revision for
rollback. Historical deployment notes are not a current cloud preflight.

The Part 1 importer currently rejects production activation. There is no executable
production import command approved or claimed here. Its owner must supply and
verify the guarded production import path before that approval packet is complete.
Likewise, inspect the actual session TTL timestamp field/type after integration.
Propose TTL for the public session collection alone; keep application expiry
checks independent. No TTL activation or broad IAM grant is authorised.

Only after the exact candidate image, preservation checks and all approvals exist
may the release owner fill and execute these image/rollback commands:

```powershell
# Approval-gated; values come from the refreshed and reviewed release packet.
gcloud run services update hotel-price-hunter --project=sincere-apex-511418-p0 --region=asia-southeast1 "--image=$approvedRegistryImageByDigest"
# Roll back traffic to the captured previous revision, under the same release authority.
gcloud run services update-traffic hotel-price-hunter --project=sincere-apex-511418-p0 --region=asia-southeast1 "--to-revisions=$previousCustomerRevision=100"
```

Preserve every existing runtime setting and access boundary. Run no supplier
transaction, cancellation/refund, email, schedule or extra Gemini generation.
After a separately approved deployment, prove public reads, captured-replay labels,
dynamic eligibility, restart persistence and two-judge isolation, and compare the
private services/data with the frozen before-state. Health alone cannot close it.
