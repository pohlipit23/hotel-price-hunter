# Independent agency identity review

15 October 2026. Fresh agents reviewed the design and final implementation against [the identity contract](agency-iap-contract.md). The user chose to continue with in-app review; no external OCR or model CLI ran.

## Findings and resolution

The design reviewer identified six substantive boundaries before final implementation:

1. Google's library permits broad expiry skew and coerces some claim types. Application validation now enforces ES256, integer numeric times, bounded lifetime/issuance and hard expiry before and after asynchronous verification/storage.
2. Library exceptions can include JWTs or decoded claims. The provider wraps them in fixed credential-free application errors.
3. An unauthorized bootstrap cannot establish the UI's authentication mode. The server identifies configured mode in the shell; errors cannot reveal a passphrase fallback in IAP mode.
4. The library's IAP key helper performs a request per call. The provider adds bounded freshness, concurrent refresh coalescing, timeout/no retries and no stale-cache fallback.
5. The shared cloud customer template enables Gemini. The agency runtime rejects model activation and constructs an unconfigured advisor directly.
6. A process-local configuration allowlist cannot promise immediate global revocation. The contract and deployment proposal explicitly require replacing all serving instances/revisions and distinguish upstream IAP policy from assertion expiry.

The fresh final implementation reviewer found **no actionable findings** after inspecting the provider, server integration, UI, tests and dependency promotion. The exact existing `google-auth-library` 10.9.1 becomes a direct dependency; lockfile package resolutions are unchanged.

## Independent experiments

- **24/24 focused tests passed** in normal Windows PowerShell: the new actual-library crypto/API tests plus preserved local agency authentication/API tests. The initial sandbox HTTP run encountered socket access denial; the normal-host run passed. No emulator or live identity provider was used in this review.
- In an isolated copied-source directory under ignored `.local/identity-implementation-review-mutation`, the reviewer bypassed exact subject membership. The existing signed-invalid-identity test failed with a missing expected rejection. Restoring the copied source returned **10/10** provider tests passing. Shared working files were never mutated for the experiment.
- Source review confirmed expiry rechecks after list/detail storage waits, credential-free session projections, identity/assertion-bound cursors, early customer-route denial and UI generation checks against delayed protected responses.
- The reviewer inspected the new browser test's explicit mocked-UI boundary; it did not claim to have rerun browser acceptance or verified actual Google sign-in.

Full-suite, browser and packaging proof is recorded separately in [agency-iap-verification.md](agency-iap-verification.md). The review does not establish cloud IAP/IAM configuration, runtime read-only effective permissions, OAuth organization eligibility, production sign-in, supplier integration or deployment. Historical cloud verification guards were not changed.
