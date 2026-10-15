# Daily watch cloud preparation verification

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

Packaging/source pins will be retained in ignored `.local/roomdrop-local-image.json`
after the production container build and network-disabled smoke. That record's
source checkout, commit, actual context hash and image config digest identify the
candidate; a local image ID is not an observed uploaded registry digest.

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
