# Private agency Google setup

Executed 15 October 2026, Asia/Kuala_Lumpur, following the user's explicit **approve all** for the exact [setup scope](agency-google-setup.md). Operator/deployer: `pete@altovo.com`. Trial credits were confirmed by the user; the actual balance was not independently observed. No billing settings changed.

## Deployed release

| Item | Verified value |
| --- | --- |
| Project / organization | `sincere-apex-511418-p0` / `977401667230`; organization `222849345270`, `altovo.com` |
| Service / region | `hotel-price-hunter-agency`, `asia-southeast1` |
| Canonical origin | `https://hotel-price-hunter-agency-2qbcpylngq-as.a.run.app` |
| Final ready revision | `hotel-price-hunter-agency-00002-c6v`, latest created/ready, 100% untagged traffic |
| Source | `af488f8796cdc2641949e6b0af4d823f6373223d` |
| Actual Docker context SHA-256 | `cf9c528e62fadc171904a2cb79b459fb8b7344b991e48578738c2df15e13966d`, 30 allowlisted files |
| Immutable tag | `agency-af488f8796cd-cf9c528e62fa` in the existing `hotel-price-hunter/agency` image path |
| Registry and runtime digest | `sha256:6daaf4ca84bd7643a72868d3164ad533c897cb4dbec31c221110977ae9346581` |
| OCI config digest | `sha256:951afed32e5a9d5567654049b85c7676b05ebbe1b6627c577891d993c0c98f3a` |
| Runtime account | `roomdrop-agency-reader@sincere-apex-511418-p0.iam.gserviceaccount.com` |

The registry manifest/config bytes were independently hashed, with exact source/context labels, `linux/amd64`, user `node`, working directory `/app`, inherited `docker-entrypoint.sh` and application command verified. The single manifest's digest equals the resolved runtime digest. The existing immutable repository policy was preserved.

IAP is enabled and Cloud Run's invoker check remains enabled. Resource controls match the reviewed plan: minimum zero, maximum one service/revision instance, 1 vCPU, 512 MiB, concurrency four, 30-second request timeout, request-based CPU, startup CPU boost off and generation two.

Production environment contains exactly seven literal agency values: `NODE_ENV`, `GOOGLE_CLOUD_PROJECT`, `APP_SURFACE`, `AGENCY_AUTH_MODE`, `APP_ORIGIN`, `AGENCY_IAP_AUDIENCE`, `AGENCY_IAP_ALLOWED_SUBJECTS`. The allowlist binds the independently verified Google subject for `pete@altovo.com`; its raw value is not reproduced here. No model, emulator, ADC path, token, passphrase or secret-sourced environment value is present.

## Executed access changes

- Enabled only `iap.googleapis.com` and created/verified its Google-managed service identity through the reviewed fixed Service Usage endpoint.
- Created the dedicated reader account with the sole observed direct project grant `roles/datastore.viewer`; no user-managed service-account keys or direct delegation bindings exist. This role reads project Firestore data; it is not a collection-level grant.
- The agency service's direct invoker binding contains only `service-977401667230@gcp-sa-iap.iam.gserviceaccount.com`.
- Before the human grant, the agency IAP policy was empty and the source/configuration/private-access verifier passed its supported checks. The final direct IAP binding grants only `user:pete@altovo.com` the resource-scoped `roles/iap.httpsResourceAccessor` role.

All cloud commands explicitly selected the requested account/project. Image upload used an ownership-checked, isolated temporary Docker configuration and a short-lived token passed through stdin; that directory was removed. No service-account key was created and no local ADC update occurred.

## Runtime reader proof and cleanup

One task-owned job, `roomdrop-agency-reader-check-20261015-af488f8`, ran execution `roomdrop-agency-reader-check-20261015-af488f8-j4rmc` once: one task, parallelism one, zero retries, 60-second task timeout, same reviewed image and attached reader identity. The command override exactly matched the committed probe plus its explicit main call; source SHA-256 was `5f36c217777682cbb9b8bab9f363dacde1b912960b01b413c878d51ce379c623`.

The actual structured result passed: metadata identity matched; the limit-one agency index query succeeded with no cases; a random absent-document read returned the expected absence; guarded update and delete returned explicit Firestore `403 PERMISSION_DENIED`. The update required an existing document, and the delete required an impossible epoch update time, so these requests could not create/delete the selected document even with unexpected write authority. No booking or fixture data was changed.

The job was deleted after verifying its ownership, identity and passing execution. An independent fresh cloud listing confirmed it absent. This proves the selected runtime reads and update/delete denials; it does not prove create denial or enumerate every inherited policy.

## Acceptance and limits

The coordinator's before/after-access verifier and an independent live reviewer confirmed exact source/image/runtime/direct grants, private IAP configuration and the unchanged full customer service/IAM fingerprint. The customer service remains `hotel-price-hunter-00006-hfm`; the new RoomDrop customer source was not deployed to it.

Anonymous requests to `/agency` and `/api/agency/session` redirect to Google's sign-in origin with HTTP 302. The existing customer's `/health` still returns anonymous 403. These are gateway access checks, not signed browser acceptance. The agency index was empty; no claim of nonempty production case privacy or historical index completeness is made.

Genuine signed browser acceptance is **human-confirmed**: in response to the deployed URL and instruction to sign in as `pete@altovo.com`, the user confirmed **Google-managed agency access and Saved cases**. This closes the pending live sign-in/display check. It is direct user observation, not an automated screenshot or separately captured HTTP response; nonempty case privacy remains outside the evidence.

The earlier automation limitation remains recorded: the in-app Browser bootstrap failed with EPERM before setup, and supported Computer Use page-state capture returned no result and was interrupted after 991 seconds. No browser input or credential inspection occurred. The successful human confirmation is separate evidence and does not rewrite the earlier machine-verifier reports or substitute mocked UI tests for live sign-in.

Organization IAM policy reads remain denied. Both live verifier reports therefore correctly retain `metadata-partial`, `fullAcceptance:false`, and the explicit inherited-policy coverage limit. The selected runtime behavior proof complements that report without claiming a complete IAM inventory. No broad organization permission was added to resolve the gap.

Safe ignored evidence includes `agency-registry-lineage.json`, `agency-before-access-verification.json`, `agency-after-access-verification.json`, `agency-cloud-independent-verification.json`, `agency-reader-proof.json`, `agency-reader-job-observed.json`, `agency-project-grants-observed.json` and `agency-frozen-source-verification.json` under `.local/`. The read-only verifier was rerun successfully from the retained source checkout after the main checkout's documentation changed; the same exact context/source/digest guards passed, with the same explicit partial-IAM status.

## Retained source for reproducible verification

The exact deployed commit and original build-context bytes are retained at `C:/Users/pohli/.codex/worktrees/agency-release-verification/hotel-price-hunter`. Its normalized Git index matches the approved commit and its actual context hash matches the image label; source guards were not relaxed. The separate historical customer-release worktree/verifier remains untouched.

Run the agency read-only verifier from this retained release checkout with its copied ignored pins:

```powershell
Set-Location 'C:\Users\pohli\.codex\worktrees\agency-release-verification\hotel-price-hunter'
node scripts/verify-agency-cloud.mjs --execute-verification --pins=.local/agency-cloud-pins.json --allow-unverified-inherited-iam
```

The explicit partial flag preserves the known organization-policy limit. Do not weaken source/digest checks to verify a later checkout. Keep this worktree while the private agency release requires re-verification.

No model call, real supplier action, payment, email, public invocation grant, customer-service deployment, source push, scheduler or recurring job was part of this approved setup.
