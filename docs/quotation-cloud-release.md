# Private quotation-demo Cloud Run release

The owner requested publication of the latest version. This release updates the
existing private customer Cloud Run service to the quotation-backed, selection-only
demo. The separate agency service, watch job, Scheduler state and Firestore data
must remain unchanged. Private access is preserved; no public invoker or new grant
is introduced. No supplier credentials or live transaction adapter is deployed.

## Hosting boundary

The existing customer service relies on Cloud Run IAP plus its IAM invoker check.
The release must verify the same boundary before/after: IAP enabled, direct Run
invocation restricted to the IAP service agent, and direct IAP access restricted
to the existing operator. Known organization-IAM visibility limits still apply;
direct-policy verification does not establish exhaustive inherited-policy coverage.

The new entry point only accepts the exact production project/customer-service
profile and canonical HTTPS origin. It enforces the canonical Host/POST Origin,
Secure HttpOnly SameSite cookies, CSRF, bounded session/body limits and selection-only
routes. Health exposes only mode/snapshot/count metadata. Default local execution
keeps its existing loopback/production guards; hosted activation is a separate,
explicit entry point. No caller-supplied quotation lookup or backend provider call
exists in the hosted server.

The packaged snapshot is the explicit safe display projection. Source selection
references are removed; a recursive private-field guard rejects credential, guest,
contact and supplier-token fields. The hosted process reconstructs only local
selection membership, with no actionable supplier reference. Confirmation remains
ephemeral and `reservationCreated:false` / `quoteModified:false`. Cloud Run restart
can clear these demo-only sessions. No Firestore data or prior visitor state is used.

## Source and image

`scripts/prepare-quotation-release.mjs` is offline by default. Explicit preparation
exports an exact Git commit's allowlisted server/UI assets into a fresh ignored
context, adds the sanitised snapshot and hashes every included file. Uncommitted
customer UI/branding work is excluded and preserved. Browser verification must
exercise the frozen files used by the image, rather than the dirty main checkout.

`Dockerfile.quotation` has a dedicated Node-only entry point and needs no npm
packages. It copies only the fixed context's app files and safe snapshot. No
preparation scripts, source credential files or raw provider artifacts enter the
image. Source/context/snapshot hashes label the local image; registry manifest and
configuration bytes must independently establish the uploaded digest and labels.

Only the customer's immutable image reference is updated. Keep runtime identity,
environment, resources, scaling, IAP/IAM and other services unchanged. Capture the
current ready revision/digest and full configuration before update for recovery;
do not automatically restore data or modify unrelated resources on drift.

## Verification gates

1. Local/hosted HTTP tests, privacy guards, Secure cookie/origin checks, one security
   guard mutation and full Node regression. Dependency audit remains a separate
   repository check; the dedicated image uses only Node built-ins.
2. Frozen-source browser acceptance and local production-profile container smoke,
   including denied transaction routes and a demo-only confirmation.
3. Fresh read-only cloud baseline: customer configuration/access, agency/watch
   fingerprints, Scheduler state, registry/database protections and saved-data
   counts/hashes. No historical baseline is silently substituted for fresh data.
4. Upload the exact image to the existing private registry with temporary isolated
   authentication; verify registry bytes/labels. Refresh service resource version
   before the sole image-only update and retain its exclusive execution ledger.
5. Verify ready revision/traffic/digest, image-only service diff, preserved access,
   other-service/data fingerprints and anonymous access denial. Authenticated live
   HTTP/browser acceptance is recorded separately; packaging/local checks cannot
   stand in for that evidence.

The approved destination remains the existing customer origin in the existing
Singapore project/region. No source push, agency/watch execution, recurring trigger,
model call, email, billing change, booking, cancellation or refund is included.

## Publication on 17 October 2026

Source: `cc8827fec277d135969719027691734de381dfd3`.
Context SHA-256: `6cf9fffcd2d80b4431b0ea24802734ddb9d5534d971912c86092d89421959cee`.
Display snapshot SHA-256: `8fe12f79f9910d9ca9123ff2069d349f3e11909c1e1f36d9708539663fb5f6f4`.
Approved registry index: `sha256:92dc83da0756ce1ba6dbac217448a1cc1406548030e81d9d1d0a7f6bedc21ddd`.
Its Linux amd64 child: `sha256:4f7f58cc8df39589a18aff75144c02fd34e9e369e5e809cdfba21c72946cd449`.
Ready revision: `hotel-price-hunter-00012-6sx`.
Private URL: https://hotel-price-hunter-2qbcpylngq-as.a.run.app/.

The full regression passed: 247 passed, six existing skips, no failures. The
production dependency audit reported zero vulnerabilities. Disabling the exact
cloud-target guard caused its focused test to fail; the restored guard passed.
Frozen-source browser checks passed at 320, 768 and 1440 pixels with no page or
console errors. The mobile options screenshot was visually inspected. The exact
image passed a read-only, network-disabled container smoke, including denied
transaction routes, Secure session cookie and a selection-only confirmation.

Temporary isolated registry authentication was removed and the existing global
Docker configuration hash was preserved. Independent registry manifest/config
bytes verified the source, context and snapshot labels and the default command.

The initial v2 image update materialized default annotations and omitted the
explicit `startup-cpu-boost:false` annotation. The strict verifier caught this.
A v1 restoration without a fresh revision was treated as a no-op; its read-only
monitor was stopped. Reapplying the original specification with a fresh revision
nonce created revision 00012 and restored the original explicit runtime settings.
Both update attempts and the restoration have separate ignored execution ledgers.
The final expected service-spec difference is the image and generated revision
nonce only. The application image remained identical throughout this correction.

Final cloud verification passed at 04:03 UTC. Revision 00012 receives 100% of
traffic and runs the independently verified amd64 child digest. The service
specification differs from the original only in image and revision nonce. Direct
Run/IAP policies, agency service, watch job, project IAM, Scheduler state and saved
data fingerprints matched the baseline. The 11 visitor records, one agency index
record and watch checkpoint were unchanged; the job remains at one execution and
no scheduler exists. Registry/database configuration and protection comparisons
exclude only the registry upload timestamp and Firestore's moving retention
timestamp/etag. All other fields are compared. The final comparison reused the
same attempt's metadata capture within two minutes and freshly reread saved data.
Anonymous root/API requests redirect to Google IAP; `/healthz` returns the Google
frontend 404 without application data. Organization-level inherited IAM remains
outside the previously available read scope, so the evidence remains explicitly
`metadata-partial` / `fullAcceptance:false`.

Signed-in live browser acceptance remains unverified: browser discovery returned
no available browsers, and the existing user's CLI identity token received HTTP
401 from IAP. No grants were added to work around this. Successful local browser,
container and startup evidence does not establish signed-in live acceptance.

Detailed evidence is under ignored
`.local/quotation-release-63fdda9c-497d-4be9-b852-30a004fbd3e6/`. The preceding
customer image/revision and configuration are retained in `cloud-before.json`
for recovery. This publication serves captured gateway results; it does not
enable automatic refreshes or claim scraper room-equivalence matching.
