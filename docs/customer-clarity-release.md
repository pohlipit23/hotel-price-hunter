# Customer clarity private release proposal

15 October 2026. The UI is implemented, locally verified and packaged. This new
candidate has not been uploaded or deployed. The earlier approval covered the
`c9a7d7f` rollout; approval for this customer-only image update is pending.

[Local preview](http://localhost:8080/) ·
[UI evidence and review](customer-clarity-verification.md)

## Exact candidate

| Pin | Value |
| --- | --- |
| Clean source | `16adf72b26d445ea9a5502dface2afd7771bf49d` |
| Retained checkout | `C:/Users/pohli/Sites/hotel-price-hunter/.local/roomdrop-ui-release` |
| Actual 32-file context SHA-256 | `180c227be4390eacdc9510859382ee75f3d841a303e350b57a5017af1361d507` |
| Local image | `roomdrop-customer-ui:16adf72b26d4-180c227be439` |
| Local build manifest / image ID | `sha256:9f6f5c33d904139e166f842fde496f79431e229085dbd7bb9b4a2e5eef01e38f` |
| Build config digest | `sha256:fbc81073aa0f0ae9857ba04cebc29cc30b1c355e2e5f0b9ab647a2bd50299615` |
| Uploaded registry digest | Not observed; no upload performed |

The network-disabled, read-only container passed customer page/bootstrap checks
using explicitly injected memory storage with Gemini unconfigured. All four changed
frontend files match the retained source's exact bytes. Source/context OCI labels,
user `node` and packaged application configuration were inspected. Local image
evidence is `.local/customer-clarity-local-image.json`; the local manifest is not a
substitute for independently observed registry bytes after approved upload.

## Requested approval scope

1. Upload this exact candidate under the existing private image path
   `asia-southeast1-docker.pkg.dev/sincere-apex-511418-p0/hotel-price-hunter/roomdrop`,
   new immutable tag `roomdrop-16adf72b26d4-180c227be439`, using isolated short-lived
   registry authentication as before. Independently hash registry manifest/config
   bytes and verify the exact approved digest/source/context before deployment.
2. Update only the existing customer service `hotel-price-hunter` in
   `asia-southeast1`, account `pete@altovo.com`, project `sincere-apex-511418-p0`,
   replacing its container image with that independently verified immutable digest.
3. Verify the ready revision, unchanged canonical origin, exact existing runtime/
   environment/limits and private IAP policies, anonymous denial and preserved data.
   Check the signed customer's revised UI without repeating booking transactions.

The current customer revision is `hotel-price-hunter-00007-lrm`; its old image is
`sha256:16340ebd837d00988d4ef0779e2ae8a0579011f8813f4b577d23099723c6a4d0`.
Retain before-state metadata for restoration and stop on source/digest/policy drift.

The customer keeps its existing writer, four literal application environment values
(production/project/customer surface/canonical origin), IAP service-agent invoker
and `pete@altovo.com` resource accessor. Preserve minimum zero/maximum one instance,
1 CPU, 512 MiB, concurrency four, 30-second request timeout, generation two,
request-based CPU and startup boost off. No new grant or resource is proposed.

Agency service/configuration/IAM and its reader remain unchanged. The existing watch
job retains the `c9a7d7f` image and configuration; its one-execution approval is spent.
Do not execute it, reset its ledger or create/activate Scheduler. No API enablement,
additional identity, model/supplier/email call, real transaction, source push,
public access or billing upgrade is included. Known inherited-IAM audit coverage
remains partial; do not weaken historical verifier/source guards.
