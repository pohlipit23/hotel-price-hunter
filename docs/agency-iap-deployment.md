# Private agency IAP deployment proposal

Prepared 15 October 2026. **Preparation only; no cloud commands have been executed for this slice.** The new application source is not deployed by this document. Existing cloud evidence and the historical verifier remain pinned to their earlier release.

## Proposed target

| Setting | Proposed value |
| --- | --- |
| Project / number | `sincere-apex-511418-p0` / `977401667230`, subject to a fresh authorized read before release |
| Separate service | `hotel-price-hunter-agency` in `asia-southeast1` |
| Image | Reviewed RoomDrop source, pushed under a new immutable tag and deployed by registry SHA-256 digest; no reuse of the historical release pin |
| Runtime account | Dedicated `roomdrop-agency-reader@sincere-apex-511418-p0.iam.gserviceaccount.com`, proposed and not created |
| Runtime data role | `roles/datastore.viewer`, subject to effective-permission review; no datastore write, Vertex, scheduler, task, email or IAM administration grant |
| Operator authorization | Narrow IAP `roles/iap.httpsResourceAccessor` binding plus exact signed-subject application allowlist; actual principals and subjects still needed |
| Invocation | Invoker IAM check enabled; IAP service agent alone receives the required service invocation grant; no `allUsers` / `allAuthenticatedUsers` |
| Limits | Request-based CPU, 1 vCPU, 512 MiB, minimum 0, service and revision maximum 1, concurrency 4, 30-second timeout, no startup CPU boost |

Firestore's server library uses IAM rather than browser security rules. The reader role covers database data reads; it is not collection-scoped. Review the dedicated project's data boundary and inherited grants before release. The application route boundary independently prevents customer mutations. [Firestore IAM](https://docs.cloud.google.com/firestore/docs/security/iam), [role permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/firestore).

## Reviewable environment

This YAML is a template, not an executable deployment. Populate the exact new service origin and verified subjects into an ignored local environment file for later review. The empty allowlist intentionally fails startup. Cloud Run supplies `K_SERVICE`; do not set its reserved variables manually.

```yaml
NODE_ENV: production
GOOGLE_CLOUD_PROJECT: sincere-apex-511418-p0
APP_SURFACE: agency
AGENCY_AUTH_MODE: iap
APP_ORIGIN: https://REPLACE_WITH_VERIFIED_AGENCY_ORIGIN
AGENCY_IAP_AUDIENCE: /projects/977401667230/locations/asia-southeast1/services/hotel-price-hunter-agency
AGENCY_IAP_ALLOWED_SUBJECTS: '[]'
```

Do not inherit `.env.cloud.example`: it enables Gemini for the older customer release. Leave `GEMINI_MODEL`, model location, emulator host, local passphrase, ADC files and tokens absent. Use only the attached reader service account; no service-account key is required.

## Release sequence requiring separate approval

1. Recheck project/region, available credits and effective access without changing billing. Verify the new service name is unused or explicitly owned. Resolve organization membership and OAuth setup: Google's managed IAP OAuth client supports in-organization identities; external/no-organization access needs custom OAuth configuration. Do not infer the project's organization from its name.
2. Review the exact operator email/principal and independently verified signed subject mapping. Store operational configuration outside tracked source. Review dedicated runtime permissions, including inherited grants, and the chosen image digest/source.
3. After explicit authorization, enable any required IAP API/OAuth setup, create the dedicated reader identity and narrow grants, and deploy the new private service with IAP enabled. This does not update or publish the existing customer service.
4. Before granting any human access, verify IAP enablement, invoker check, absence of public/broad grants, exact audience/service/origin, reader runtime account, model-disabled environment and image/source lineage. For a new service, an initial private placeholder origin can be replaced with its observed canonical origin while access stays closed.
5. After separately approved narrow operator grants, prove genuine Google browser sign-in and allowed/denied principals. Verify missing/invalid JWT bypass requests fail inside the application; a plain authenticated Cloud Run caller is insufficient. Test session recheck, expiry, case privacy, cursor reset, customer mutation denial and the reader identity's lack of write authority. Use a disposable test document for any explicitly approved permission probe; no customer transaction is authorized.
6. Record the new revision and evidence separately. Keep the old `verify-private-cloud.mjs` source/digest guards intact; create a separately reviewed verifier for this release before execution. No additional Gemini calls are needed for agency identity.

For operator review, current documented command shapes include `gcloud run deploy SERVICE --iap`, service-agent `roles/run.invoker`, and `gcloud iap web add-iam-policy-binding --resource-type=cloud-run --service=SERVICE --region=REGION --role=roles/iap.httpsResourceAccessor --member=user:EMAIL`. These are reference shapes, deliberately not a ready-to-run provisioner. An exact bounded execution bundle must include the verified digest, environment file, runtime account and named approved principal before approval. [Cloud Run IAP setup and access](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run), [deploy flags](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy).

## Rollback and revocation

Withhold or remove human IAP grants and stop routing to a defective new agency revision through an explicitly approved operation. Do not turn off IAP, disable invoker checks, broaden access, or reuse local passphrase mode as a workaround. A previous agency revision is a rollback candidate only if its image, environment, allowlist and IAM remain reviewed. Remove revoked subjects from every serving revision/instance; environment-only changes do not instantly invalidate signed tokens in other processes. Cursors are process-local and may need restarting after rollout or renewal.

Production scheduling/tasks, actual supplier access, email delivery, customer deployment, public release and competition submission remain separate work. None is implied by preparing operator identity.
