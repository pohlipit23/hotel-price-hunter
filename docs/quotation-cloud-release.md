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

Execution pins and results are recorded after the concrete image is verified.
