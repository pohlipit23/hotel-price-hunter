# Private customer demo and daily watch preparation

15 October 2026. Local development contract; no cloud mutation, upload, deployment,
email, live supplier call, OCR or model generation is authorised. Extends the existing
price-watch contract without widening transaction authority or changing customer UI.

## Customer access and rollout boundary

Prepare an update of the existing `hotel-price-hunter` customer service behind its own
Google IAP gate, restricted to `pete@altovo.com`. Keep its customer surface and existing
writer identity separate from the deployed read-only agency service. IAP gates the
whole customer service; visitor cookies, exact-origin and CSRF checks still protect
customer state. This is a private single-operator fictional demo, not customer account
authentication. No customer mutations are added to the agency surface.

The deployment proposal must identify the exact clean source/context, independently
verified image digest, runtime identities, direct grants, resources and limits before
requesting cloud approval. Preserve both historical release checkouts/verifiers. The
customer image must contain no Gemini model configuration; the job has no advice,
email or supplier adapter. Cloud data and signed browser acceptance remain release
gates, not claims established by emulator tests.

## Daily job executable

- Add a separate production job entrypoint. Preserve the local worker's production,
  demo-project and loopback-emulator guards. Share the existing pure pass/engine.
- Production activation requires exact project `sincere-apex-511418-p0`,
  `NODE_ENV=production`, Cloud Run job `roomdrop-price-watch`, explicit enabled
  configuration and `simulated-fixture` provider mode. Reject emulator, service
  runtime, model configuration, credential-file configuration and unexpected CLI args.
  Use the attached runtime identity through the existing Firestore library.
- One task, parallelism one, at most ten processed pages of 50 locators per execution,
  plus one bounded tail lookup to distinguish an exact 500-entry end from more work.
  An exact-size sweep must not consume the following daily run just resetting an empty
  cursor. A failed tail lookup cannot advance the final page checkpoint. Apply
  a cooperative elapsed-time/termination bound and Cloud Run's 300-second hard task
  timeout. No local endless loop in the production entrypoint.
- Persist a private resume checkpoint in Firestore, separate from visitor state.
  Advance it only after a whole page completes without a transient storage failure.
  Use an atomic revision comparison so overlapping executions cannot overwrite newer
  progress. A conflict fails safely; repeated page work converges through the existing
  daily intents. Reaching the end resets the cursor. No private cursor/locator in logs.
- A failed/interrupted page is retried from its previous checkpoint. Saved successful
  checks replay without new previews; capacity and existing terminal provider failures
  remain truthful. Never checkpoint past an uncommitted transient failure. Preserve
  consent, booking/preference/version, session/day/deadline commit guards.
- Log aggregate counts and fixed safe reason/stage codes only. Exit nonzero for
  transient storage/checkpoint failure; do not print credential-bearing exceptions.
  Close storage and honour SIGTERM/SIGINT. Tests may inject memory/emulator storage,
  clocks and fixture providers explicitly; the executable has no memory fallback.

## Offline cloud command bundle

Provide a default-offline command generator with structured argument arrays and no
execution switch. Every cloud step pins account/project/region. Prepare:

1. Updated private customer service with IAP, no public invoker, exact origin, existing
   writer, min zero/max one instance, 1 CPU/512 MiB, concurrency four, 30-second request
   timeout, request-based CPU and startup boost disabled.
2. Dedicated `roomdrop-watch-writer` runtime with project `roles/datastore.user` and no
   model role; explain that this is project-wide Firestore write access. Dedicated
   `roomdrop-watch-trigger` gets only job-scoped `roles/run.invoker`, no datastore role.
3. Job `roomdrop-price-watch` with digest-pinned reviewed image, one task, parallelism
   one, one retry, 300-second task timeout, 1 CPU/512 MiB and the exact job entrypoint.
4. Cloud Scheduler `roomdrop-daily-watch`, daily 08:00 Asia/Kuala_Lumpur, OAuth to the
   fixed Google Run v2 `jobs/roomdrop-price-watch:run` API with `{}` body, no overrides,
   bounded trigger retries. Keep Scheduler absent until separately approved one-shot
   and customer/agency verification pass and activation is explicitly approved; the
   create API cannot create it paused. Supply a pause command for stopping it later.

The scheduler acknowledges job submission, not successful processing. Operators must
inspect execution result/counts and lag; the 500-entry cap can require later runs to
finish a sweep. Do not promise a daily SLA at arbitrary index sizes. No Cloud Tasks.
Limits reduce use but are not a spending cap. No new recurring local automation.

Official references checked for this preparation: [scheduled jobs](https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule),
[task timeout](https://docs.cloud.google.com/run/docs/configuring/task-timeout),
[Cloud Run IAP](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run).

## Local acceptance

Prove default/invalid environment denial before storage creation, restart/daily dedupe,
next-day work, concurrent checkpoint safety, more-than-one-page resume, interrupted/
failed-page replay, consent/expiry guards and privacy-safe diagnostics. Exercise actual
Firestore checkpoint transactions in an isolated emulator namespace. Run the existing
full Node regression suite and packaged production-mode default-denial smoke. Review
the source and offline command bundle independently. Record local evidence separately
from all pending cloud deployment/IAM/sign-in/runtime gates.
