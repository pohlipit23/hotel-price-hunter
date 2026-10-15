# Independent Google setup preparation review

15 October 2026. A fresh reviewer inspected `scripts/prepare-agency-cloud.ps1`, `scripts/verify-agency-cloud.mjs`, `scripts/check-agency-reader.mjs`, their two test files and [the explicit approval scope](agency-google-setup.md). No external model or OCR review ran.

The reviewer found no remaining actionable issues in the final preparation bundle. It independently ran **17/17 focused tests** and both offline entry points. Those entry points perform no cloud requests by default.

Two guard mutations in isolated copied-source directories were detected by the existing tests:

- Bypassing the default rejection of unavailable organization IAM caused the inherited-IAM test to fail.
- Ignoring the Firestore `PERMISSION_DENIED` error status caused the guarded-denial test to fail.

The coordinator also corrected two environmental assumptions before final review. The official Node image retains `docker-entrypoint.sh`; local image inspection confirmed it, and the verifier now requires that exact entrypoint. The installed CLI lacks the beta service-identity command group; its help attempt could not install the missing component because of SDK directory permissions. No component was installed. The offline bundle instead describes Google's fixed `generateServiceIdentity` REST operation, with the same explicit approval requirement. It does not execute that operation.

Review covered exact account/project/service targeting; project-wide viewer scope; before/after human access policy; private IAP service-agent invocation; immutable image source/context/manifest/config linkage; customer-service preservation; absent model/credential configuration; and guarded, non-creating/non-deleting runtime probes. The source/context guard retains the unchanged application Docker allowlist. The historical verifier and its digest/source guards are untouched.

The unavailable organization-policy audit remains explicit. The verifier's opt-in partial mode reports `metadata-partial` and `fullAcceptance:false`; it does not convert missing evidence into a pass. The job probe is evidence for selected actual reads and update/delete denials only, not a complete IAM inventory or create-permission denial.

No live rollout, identity-provider browser acceptance, actual reader-permission check, API enablement, IAM mutation or image upload occurred during this review. The reviewer's Docker inspection was sandbox-denied; the coordinator separately checked the existing local image on the normal host. Future cloud changes remain behind the specific approval requested in the setup checkpoint.
