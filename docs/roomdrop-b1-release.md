# B1 customer private release proposal

Prepared and deployed 16 October 2026, Asia/Kuala_Lumpur. The user explicitly
approved completion after the exact image and registry approval request. B1 is
ready as `hotel-price-hunter-00009-hgw`, receiving 100% traffic. See the
[execution and acceptance record](roomdrop-b1-execution.md). Signed-in live UI
acceptance remains pending because the browser connection was blocked.

## Candidate and evidence

The customer receives the B1 photo-ticket design, negative saving stamps, filters,
illustrated price/room/cancellation review, explicit watch consent and persistent
approval retries. Fictional switch stages still require deliberate demo advances.
The source change is limited to five customer frontend files and supporting tests
and documentation. No backend, permissions, storage or worker behavior changed.

| Pin | Value |
| --- | --- |
| Source commit | `521fd329db9bef77a14ce03037343f821e98adad` |
| Frozen checkout | `C:/Users/pohli/Sites/hotel-price-hunter/.local/roomdrop-b1-release` |
| Actual 32-file context SHA-256 | `e5dbf6ca5d6c4415ea6ed2ea6fb52972040763ff7327bb284af12dbe8811bbd3` |
| Local image | `roomdrop-customer-b1:521fd329db9b-e5dbf6ca5d6c` |
| Local manifest / image ID | `sha256:b3d1a382767e2d3bf600d270df59aebde63e2f94ddee98b6ff8d00ab7fc43397` |
| Build config digest | `sha256:6321861de6db89aad45641d528f3c3eadd42b1fda96620252e09941ea212d7c0` |
| Proposed registry tag | `roomdrop-521fd329db9b-e5dbf6ca5d6c` |
| Uploaded registry digest | `sha256:b3d1a382767e2d3bf600d270df59aebde63e2f94ddee98b6ff8d00ab7fc43397` |

[Verification](roomdrop-b1-verification.md): 195/195 emulator-enabled tests,
zero skips/failures; 12 B1 browser acceptance groups, 96 layout checks and 32
screenshots, zero browser runtime errors; syntax and whitespace checks pass;
production dependency audit reports zero vulnerabilities. Existing independent
source review has no unresolved findings. No new external OCR was run.

The image passed page/bootstrap and five served-file checks in a temporary,
network-disabled, read-only container using explicitly injected test-memory storage.
All five frontend hashes match the frozen checkout. The image runs as `node`, has
the expected source/context labels and default server command, and has no model,
credential or emulator configuration. The clean source/context check passed again
after building. This establishes packaging, not cloud persistence or Google sign-in.

## Proposed deployment approval

1. Upload this exact image to the existing private image path
   `asia-southeast1-docker.pkg.dev/sincere-apex-511418-p0/hotel-price-hunter/roomdrop`
   under the proposed tag above, using isolated short-lived registry authentication.
   Independently retrieve and hash registry manifest/configuration bytes and verify
   the source/context labels before deployment. Stop on any mismatch.
2. Update only the image of the existing customer service `hotel-price-hunter`,
   project `sincere-apex-511418-p0`, region `asia-southeast1`, account
   `pete@altovo.com`, using the independently verified immutable digest.
3. Verify the ready revision and traffic, unchanged runtime settings and private
   IAP access, preserved saved data and unchanged agency/watch configuration.
   Confirm the signed-in B1 page without repeating booking transactions.

Immediately before the update, retain and compare service/revision/configuration,
direct IAM/IAP and data fingerprints against the approved baseline. Preserve the
existing writer, literal model-free environment, minimum zero/maximum one instance,
1 CPU, 512 MiB, concurrency four, 30-second timeout and other runtime settings.
Use a new B1 verification record; do not rewrite historical verifiers or evidence.
Inherited-IAM coverage remains explicitly limited until independently established.

The existing agency reader and watch job remain as they are. No Scheduler creation,
job execution, API enablement, new identity/grant, source push, public access,
model/supplier/email calls, real transactions or billing changes are included.

## Current service and recovery target

A read-only service/revision check at `2026-10-16T03:01:06.2242494Z` confirmed
`hotel-price-hunter-00008-87j` is ready and receives 100% traffic at the unchanged
origin `https://hotel-price-hunter-2qbcpylngq-as.a.run.app`. Its image digest is
`sha256:9f6f5c33d904139e166f842fde496f79431e229085dbd7bb9b4a2e5eef01e38f`.
This check did not refresh IAM or stored-data verification.

Retain that immutable image as the recovery target. Stop deployment on any lineage,
access, configuration or data mismatch. If the B1 release fails health, static asset,
bootstrap or signed visual acceptance, prepare an image-only restoration to that
digest against the saved baseline, preserving data and access. Restoration requires
explicit authorization; none has been performed during preparation.

Ignored evidence: `.local/b1-source-plan.json`, `b1-local-image.json`,
`b1-build.log`, `b1-image-inspect.json`, `b1-package-smoke.mjs`,
`b1-package-smoke.json` and `b1-cloud-observed.json`.
