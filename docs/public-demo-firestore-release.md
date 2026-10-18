# Curated RoomDrop Part 2 release preparation

Status: the final Part 1 email/hand-off/UI slice (1f82761, a32e350, 410ba31) is
integrated, with masked watch bindings and a single journey indicator. Arm uses
the judge helper, including deliveryEmail. Contract v7 local acceptance: npm
398 pass/35 skips, core emulator 71/71, Firestore browser five widths and judge
browser three widths pass. Gateway Drops/photos remain pinned; engine capture
commits are excluded. See the current verification section and shared ignored
deployment plan. No push, deploy, production import or live call is included.

Both hosted entrypoints require Firestore, the canonical customer profile and an
exact reviewed code/version manifest. They never import, seed or use a memory/file
fallback at hosted startup. The production emulator guard remains mandatory.
The private delivery address stays in the stored session; public bindings and
receipts contain only its masked projection. Email delivery is not enabled.

| Historical v5 local candidate (rebuild for v7) | Value |
| --- | --- |
| Runtime source | c7de6a474254078481944d3fa7e20b6446cdd2b4 |
| Context SHA-256 | 1efce687edc69efc6260702f6377627c5965a8690bdcf1f2b763d98530281224 |
| Catalogue manifest SHA-256 | 6a8f104558ed6742544547e72f64abf7b9ffa53d9f25552b82161cd093ba62cb |
| Local image | roomdrop-booking:c7de6a474254-1efce687edc6 |
| Local image ID | sha256:a81f9b00ed4a09e25d6ae2f3300edfafe80ad112ef89f07b9c075a1616d1d0a6 |
| Packet | .local/integration/v5-release-pin.json |
| Context | .local/booking-release-03b3a359-64df-4d4c-b209-54357abf7f0b/context/ |

This is a local image ID; no registry push or registry-byte verification occurred.
The context contains code, eight approved public JPEGs and version pins. It
contains no private captures, source URLs, credentials or visitor state.
Missing runtime imports/assets fail preparation or the packaging regression.

Local proof: 419 Node tests (388 pass, zero fail, 31 reported skips); the selected
actual-emulator core files pass 53/53. Five-width real-capture/browser tests prove
arm/confirm/restart/context/isolation, 182 -> 181 hash navigation and stale-tab
rejection. Photo fallback/load-failure, navigation during an arm request, Gemini
geometry, keyboard and historical single-snapshot tests also pass. The image
smoke verifies both hosted entrypoints and all eight photo hashes, then separate
network-disabled CLI runs reject the production emulator profile with exit 1.
All model responses were injected; the packaged model-unavailable path makes
zero model calls. Full evidence: public-demo-firestore-verification.md, current
Part 2 section.

## Reproduce the frozen local bundle

Run from the Part 2 worktree only. Preparation reads exact git bytes rather than
uncommitted files. Test-injected bundles are explicitly marked and have no
registry destination. Current manifest pins are stored only under ignored .local.

```powershell
Set-Location 'C:\Users\pohli\Sites\hotel-price-hunter\.local\roomdrop-part2'
$sourceCommit = 'c7de6a474254078481944d3fa7e20b6446cdd2b4'
$prepared = node scripts\prepare-booking-release.mjs --prepare "--source=$sourceCommit" --manifest=.local\integration\v5-catalogue-manifest.json | ConvertFrom-Json
$bundle = Get-Content -LiteralPath $prepared.manifestPath -Raw | ConvertFrom-Json
if ($bundle.sourceMode -ne 'git-commit' -or -not $bundle.uncommittedFilesExcluded) { throw 'Test source cannot be released' }
docker build --tag $bundle.localImageTag $bundle.contextDirectory
docker image inspect $bundle.localImageTag --format '{{.Id}}'
```

Compare every context file hash with the packet before accepting a rebuilt image.
The normal CLI refuses emulator configuration in production. The local image
smoke uses an explicit injected test storage factory and a read-only scratch
script, Docker network namespace container:roomdrop-part2-firestore, no published
host ports, and demo-roomdrop-part2 at 127.0.0.1:8281. It does not weaken the CLI.
The scratch script is .local/integration/v5-image-smoke.mjs; results and guards are
in v5-image-smoke.log and v5-image-guards.json in that directory.

## Reviewed emulator catalogue and ports

The existing Part 2 emulator remains roomdrop-part2-firestore on 127.0.0.1:8281,
project demo-roomdrop-part2. No Java/gcloud startup or other emulator was used.
The Part 1 reviewed s0.6 catalogue and s0.5 image manifest were copied read-only
into .local/integration/v5-catalogue.json and v5-images.json. The guarded importer
created six bookings/twelve Drops in the fresh namespace roomdropPart2PhotosV5.
Earlier default roomdrop records are retained. The reproducible ignored helper
v5-import.mjs calls the guarded importer with that explicit namespace; repeat
imports are create-only. The public runtime does not import anything.

```powershell
$env:GOOGLE_CLOUD_PROJECT='demo-roomdrop-part2'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8281'
node .local\integration\v5-import.mjs
node tests\booking-firestore.browser.mjs --existing --prefix=roomdropPart2PhotosV5 --catalogue=.local/integration/v5-catalogue.json
```

The raw capture remains the first reviewed Gateway capture, not fresh availability.
The user cut engine recapture for the submission deadline: retain the Gateway
Drops of record and reviewed images. Any later recapture is separate work and
requires a new manifest, watch/replay/browser checks and frozen bundle.

Manual ports remain booking 8294, quotation 8293 and simulation 8290 with
APP_ORIGIN=http://127.0.0.1:8290. Browser harnesses allocate port 0. Never touch
Part 1/8181 or the legacy 8081 emulator. Tests clean only their own namespaces.

## Separate live approval packet still required

Before approval, refresh the current customer revision, runtime image digest and
complete service configuration; the agency's private IAP boundary; project IAM;
Firestore shared/session/simulation data preservation; and Scheduler state.
Record exact before-state hashes and retain the previous customer revision for
rollback. Historical deployment notes are not a current cloud preflight.

The importer now supports an owner-run production target only with `--production`,
`--project=sincere-apex-511418-p0`, matching `--confirm-project`, and
`--database=(default)`. It still defaults to offline validation; only `--execute`
opens Firestore. It refuses emulator/runtime/mismatched targets and alternate
namespaces. The shared storage transaction uses creates only; identical retries
are unchanged and conflicting booking facts abort the transaction. No overwrite,
delete, force, or runtime import endpoint is provided. Flags do not confer approval.

The exact single-line PowerShell deployment plan is in the shared ignored
`.local/roomdrop-deploy-plan.md`. Current read-only cloud snapshots are in this
worktree's `.local/deploy-preflight/`. The plan waits for the final Part 1 UI
commit, then freezes/builds/pushes the integrated source, imports the six reviewed
records BEFORE startup-dependent deployment, creates a revision without traffic,
checks preserved settings, and separately switches traffic. Each live mutation
requires user approval. Rollback moves traffic to the captured previous revision;
it never deletes imported records. No production import or deploy has run.
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
