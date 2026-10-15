# Agency operator identity

Approved direction: Google Identity-Aware Proxy (IAP), selected by the user on 15 October 2026. This slice prepares application code, offline verification and a deployment proposal. It does not enable IAP, change IAM, deploy, publish, send email or invoke a model.

## Service boundary

IAP authenticates every request to a Cloud Run service. The agency therefore uses a separate service with `APP_SURFACE=agency` and `AGENCY_AUTH_MODE=iap`. It can share a reviewed image and Firestore data with the customer service. The customer service retains its existing customer flow; its agency APIs default closed. Existing loopback-only `local-review` is preserved for fixture review and remains prohibited in production.

The agency surface exposes only its shell, required styles/scripts/branding, liveness and read-only agency APIs. Customer bootstrap, enrolment, approval, advice, watch and simulation endpoints are unavailable there, even to an authenticated operator. Startup rejects an agency surface without IAP, IAP on the customer surface, unsafe production configuration and model activation. Agency startup keeps the advisor unconfigured.

Cases remain fictional, indexed simulated operations. Production identity does not establish production supplier integration, historical indexing completeness or real transaction authority.

## Identity contract

- Require exactly one bounded `x-goog-iap-jwt-assertion` header. Cookies, `Authorization`, forwarded email/role and unsigned Google identity headers cannot substitute for it.
- Verify the ES256 signature with Google's IAP public keys, exact issuer `https://cloud.google.com/iap` and the configured audience `/projects/PROJECT_NUMBER/locations/REGION/services/SERVICE_NAME`. The audience's service must match Cloud Run's `K_SERVICE`.
- Require numeric integer `iat`/`exp`, issuance no more than 30 seconds ahead, expiry strictly in the future, positive lifetime no longer than 660 seconds, and a bounded subject. These checks tighten the library's default expiry skew; its `maxExpiry` argument alone is insufficient.
- Authorize only exact subjects in `AGENCY_IAP_ALLOWED_SUBJECTS`, a bounded JSON array. An email match, domain match or wildcard grants no role. Obtain actual subject values through an independently verified operator identity process before release; never turn on access by trusting an unverified assertion.
- Fetch only the fixed public-key endpoint `https://www.gstatic.com/iap/verify/public_key`. This is a public verification-key read, not inference or credential delivery. Bound its timeout, disable retries, coalesce refreshes and cache keys for bounded freshness. An unavailable or expired key cache denies access.
- Check the signed identity independently on every agency API request and recheck expiry/authorization after asynchronous storage reads. Do not retain or log assertions. Wrap library errors, which can contain JWTs, in generic application errors.

The deployment allowlist is configuration, not a central revocation service. Updating it requires replacing every serving instance/revision; an already signed assertion is not immediately revoked worldwide. Emergency upstream IAP access removal and instance/revision rollout need their own authorized operational checks. No stronger revocation guarantee is claimed.

## HTTP and display contract

`GET /api/agency/session` returns only authenticated status, reviewer role, `mode: google-iap` and assertion expiry. It creates no local operator or customer cookie and exposes no subject, email, JWT or CSRF token. Application passphrase login and logout are unavailable in IAP mode; IAP owns the browser session.

Agency case projections and page limits remain unchanged. In-process cursors are opaque, capped at five minutes and assertion expiry, and bound to the verified subject/assertion. Renewal may require restarting pagination. Server restart invalidates cursors; no shared cursor store or multi-instance continuity is claimed.

The shell identifies its configured authentication mode independently of successful session verification. Managed access hides the passphrase form and application logout, offers a read-only access recheck and clears protected case content on denial or expiry. Delayed responses cannot restore content after access has been cleared. The local fixture login/logout behavior is preserved. There is no customer layout change.

## Acceptance and evidence boundaries

1. Offline tests use generated test-only signing keys with the actual pinned Google verification library. Missing, malformed, duplicate, forged, wrong-algorithm/issuer/audience/subject, expired/future/overlong assertions deny access without credential output.
2. Configuration tests prove default denial and invalid surface/environment/provider combinations. API tests prove read-only routing, no visitor/model effects, safe session responses, cursor isolation and invalidation during storage waits.
3. Existing tests run in a separate demo emulator namespace so the retained daily worker cannot modify their fixtures. Browser evidence distinguishes intercepted UI states from genuine signed-token/API verification.
4. Deployment stays unverified until an approved private rollout proves actual Google sign-in, allow/deny policy, attached read-only runtime identity, bypass denial, source/image lineage and browser behavior. No local test satisfies that gate.

## Primary sources

Checked 15 October 2026:

- [IAP signed headers](https://docs.cloud.google.com/iap/docs/signed-headers-howto): ES256, verification keys, issuer, Cloud Run audience and token timing.
- [IAP for Cloud Run](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run): service-wide IAP, service-agent invocation and organization/custom OAuth prerequisites.
- [Google Node authentication library](https://github.com/googleapis/google-auth-library-nodejs): official IAP verification example. The implementation pins the already installed `google-auth-library` 10.9.1 as a direct dependency.

Deployment preparation and remaining decisions are in [agency-iap-deployment.md](agency-iap-deployment.md).
