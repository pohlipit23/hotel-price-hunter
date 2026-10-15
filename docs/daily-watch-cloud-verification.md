# Daily watch cloud preparation verification

Subsequent approved deployment and remaining acceptance are recorded in
[roomdrop-cloud-execution.md](roomdrop-cloud-execution.md). The checks below describe
the earlier local preparation, not the current deployment status.

15 October 2026. This record covers local source, emulator and packaging checks for
[the daily job contract](daily-watch-cloud-contract.md). It does not record a cloud
deployment or an active schedule. Supplier observations remain simulated and all
notification records remain previews.

## Evidence boundaries

The retained emulator is used through `127.0.0.1:8081` in the isolated
`demo-roomdrop-iap-qa` project namespace. Existing task-owned app/worker/emulator
processes are preserved. New job progress tests use their own collection. No cloud
credentials, personal browser session, supplier, model or email provider is needed.

The historical agency release checkout remains the source for its strict verifier.
Its current `metadata-partial` / `fullAcceptance:false` inherited-IAM limitation and
human-observed signed browser acceptance remain as documented in
[agency-cloud-execution.md](agency-cloud-execution.md). This preparation does not
revalidate or broaden that historical evidence.

## Local checks

The full emulator-enabled `npm test` run passed **194/194**, zero failures/skips,
in 112.3 seconds. Safe output is retained in
`.local/roomdrop-daily-watch-full-test.log`. This includes actual Firestore checkpoint
transactions, independent-client overlap, partial-page retry, existing customer/
agency/watch API regressions and both offline command/source guard suites.

Independent review found and closed the exact-500-entry alternate-day bug. Final
focused worker verification passed **28/28** with the emulator. The fresh reviewer
also passed the cloud suite **6/6**, two independent emulator probes and copied-source
activation/cleanliness guard mutations. See [the review](review-daily-watch-cloud.md).

The production container build passed. Network-disabled, read-only containers with
no credentials, mounts or published ports proved default job denial, preserved local
worker production denial, the job's explicitly injected empty-memory pass, and the
customer page/bootstrap with explicitly injected memory and Gemini `unconfigured`.
These packaging checks establish no deployed Firestore or IAP behavior. Safe outputs
are in `.local/roomdrop-job-default-denial.log`, `roomdrop-local-worker-denial.log`,
`roomdrop-packaged-job-smoke.json` and `roomdrop-packaged-customer-smoke.json`.

Exact pins are retained in ignored `.local/roomdrop-local-image.json`:

| Pin | Value |
| --- | --- |
| Clean source | `c9a7d7f139309763b0f5133fdb647eff0a85a462` |
| Retained source checkout | `C:/Users/pohli/Sites/hotel-price-hunter/.local/roomdrop-watch-release` |
| Actual 32-file context SHA-256 | `6c49c8eef25752206e5e860480375f88b5d4fd43e7ac85ac212c6af8e787325c` |
| Local image tag | `roomdrop-daily-watch:c9a7d7f13930-6c49c8eef257` |
| Local build manifest / image ID | `sha256:16340ebd837d00988d4ef0779e2ae8a0579011f8813f4b577d23099723c6a4d0` |
| Build-reported config digest | `sha256:d3c7556ba51898e1a1e6e081509ea246999c9d78c324914f9ce9dda96733c46d` |
| Uploaded registry digest | Not observed; no upload authorised or performed |

OCI source/context labels and user `node` were checked in the local image. The build
manifest is a local candidate pin, not an independently observed registry digest.
After approved upload, independently retrieve/hash registry bytes; any digest or
source/config mismatch blocks deployment. The frozen release checkout remains clean
even as the main checkout gains this final evidence record. Do not use a later main
HEAD as the candidate source or loosen a source guard.

The concrete offline plan `.local/roomdrop-cloud-plan.json` was generated from that
retained checkout with its exact source pin. It reports zero executed cloud commands
and `readyForDeploymentReview:false` until independent uploaded registry-byte evidence
exists. The default plan excludes one-shot execution and recurring activation.

## Pending release acceptance

- Explicit approval for the exact reviewed source/image, customer IAP change, new
  writer/trigger identities and grants, image upload and bounded job resources.
- Independent uploaded digest/config/source lineage verification; private customer
  revision/environment/limits and direct access-policy inspection. Keep any denied
  inherited IAM coverage explicit.
- Actual Google sign-in to the customer service, saved watch consent and stop/reload,
  explicit simulated switch/refund, and that same case in the separate agency reader.
  These require fresh cloud data and genuine signed browser evidence.
- One approved job execution proving recorded checks/previews and durable progress
  in the cloud data store. Repeat only within explicitly approved execution limits.
- Verify reader/service/IAM preservation, no model/emulator/credential config, no
  public principal, and sanitized logs. The existing customer writer retains its
  historical model grant; omitting model configuration disables advice for this demo,
  and no new model permission or inference budget is granted.
- Keep Scheduler absent during acceptance. Create the daily 08:00 Kuala Lumpur
  trigger only after explicit activation approval and passing acceptance. Observe
  execution results separately from successful Scheduler API submission.

No private customer rollout, scheduler activation, live supplier work, real refunds,
email, public access, source push or additional Vertex attempts is claimed here.
