# Curated RoomDrop Part 2 release preparation

Status: the user-authorised setup merge through `8423825` is committed as
`f47960e` and local integrated acceptance passes. The client uses the judge arm
helper and the Gemini launcher no longer covers card prices or review controls.
It is not a final release: Claude's photo capture and final F11a evidence remain
pending. No push,
deployment, production import, live call or access change is included.

The hosted booking and quotation entrypoints require server Firestore storage,
the canonical customer deployment profile and a reviewed code/version manifest.
They never seed/import or fall back to packaged booking facts or memory on storage
failure. The actual Part 1 storage and arm modules are now integrated unchanged.
Both hosted entrypoints serve the curated RoomDrop facade. Injected test factories
are explicit programmatic dependencies; no production environment switch enables
test storage. The exact image passed actual-emulator arm/confirm/restart and
model-unavailable checks; both command-line entrypoints refused the prohibited
production emulator profile in separate network-disabled tests.

F9a and F10a ownership transferred to Codex, alongside F9b/F10b. Claude retains
F6/F7a/F11a; later Part 1 merges require another user go-ahead.

| Frozen integration pin | Value |
| --- | --- |
| Source commit | `f47960e9734bfe1933803ecb504cfee6d68b22fd` |
| Context SHA-256 | `c50762a10fdb3df936fa16b5e42bf536ef0643543c8e02f0280a4d3e50ce951d` |
| Catalogue manifest SHA-256 | `cb0a3fbe3146c8181844a574333389d769ed6780481849dd20fc6e5c86dc4dc5` |
| Local image | `roomdrop-booking:f47960e9734b-c50762a10fdb` |
| Local image ID | `sha256:132c1a1e2e4c5dc062944300868bb4ba886262d0d3cc69729a36134c4976c1fa` |
| Local packet | `.local/integration/setup-merge-release-pin.json` and `.local/booking-release-d1c699b5-5641-4da1-b115-f94f6aff0637/manifest.json` |

This is a local image ID, not verified registry byte evidence. No image was
pushed. The source and served assets are frozen; the real capture payload is
absent from the image. The packet contains only reviewed code/version pins.

## Finish locally before requesting release approval

1. Wait for Claude's photo-capture/final F11a handoff, obtain authority for any later merge,
   then retest the affected UI and exact combined image. Do not merge the moving
   branch tip under the earlier permission for `8423825`.
2. Preserve the current durable bootstrap projection and Part 1's arm transaction.
   The client delegates to `judge.armRequestBody` to send `expectedRevision`;
   startup uses `bookingStorage` as its sole
   source, with loaded version bindings separately named `reviewedCatalogue`.
3. Complete final content/photo/scenario review and production preservation checks.
   The supplied real catalogue has now been validated and imported locally:
   AIRB000180-183 arm with three captured Drops each; 179/184 refuse as
   non-refundable. This proves captured local mechanics, not fresh availability.
   The supplied cards remain draft metadata. Any extra capture needs separate
   authorisation.
4. Refreeze the exact combined source if code or reviewed pins change. The current
   `.local\integration\reviewed-catalogue-manifest.json` already contains all six
   actual imported code/version bindings, in this shape:

```json
{"schemaVersion":1,"entries":[{"code":"OWNER_APPROVED_CODE","contentVersion":"VERIFIED_CONTENT_HASH","dropSetVersion":"VERIFIED_DROP_SET_HASH"}]}
```

The example illustrates the shape; use the actual six-entry pin file above.
Pins must match `loadHostedCatalogue` exactly. No hotel facts, raw captures,
credentials, supplier references or judge state are packaged in that manifest.

```powershell
Set-Location 'C:\Users\pohli\Sites\hotel-price-hunter\.local\roomdrop-part2'
$sourceCommit = 'f47960e9734bfe1933803ecb504cfee6d68b22fd'
$prepared = node scripts\prepare-booking-release.mjs --prepare "--source=$sourceCommit" --manifest=.local\integration\reviewed-catalogue-manifest.json | ConvertFrom-Json
$manifestPath = $prepared.manifestPath
# Verify every hash before building.
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
`npm run emulator`. The following guarded command imported the user-approved real
catalogue combined with the supplied cards, all under ignored `.local\`.
An identical retry is create-only/idempotent. Synthetic browser tests use their
own namespace rather than overwriting these real-capture records.

```powershell
$env:GOOGLE_CLOUD_PROJECT='demo-roomdrop-part2'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8281'
node scripts\import-altovo-catalogue.mjs --catalogue=.local\integration\reviewed-real-catalogue.json
node scripts\import-altovo-catalogue.mjs --catalogue=.local\integration\reviewed-real-catalogue.json --execute --project=demo-roomdrop-part2 '--database=(default)' --emulator=127.0.0.1:8281
node tests\booking-firestore.browser.mjs --existing --catalogue=.local\integration\reviewed-real-catalogue.json
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
The committed v2 session module stores `ttlAt` as a Firestore Timestamp, verified
against the actual adapter on the Part 2 emulator. It keeps numeric `expiresAt`
for application expiry and omits `ttlAt` from returned sessions. Propose TTL on
`roomdropPublicSessionsV1.ttlAt` alone, after integration and a refreshed database
preflight; keep application expiry checks independent. No TTL activation or broad
IAM grant is authorised.

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
