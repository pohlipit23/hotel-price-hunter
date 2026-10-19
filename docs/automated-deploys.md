# Automated Cloud Run deploys

Merges to `main` that touch the app release themselves through [`.github/workflows/deploy-cloud-run.yml`](../.github/workflows/deploy-cloud-run.yml). Traffic only moves after you approve it in GitHub.

## The pipeline

| Job | What it does | Touches live? |
| --- | --- | --- |
| `test` | Unit tests, three fixture browser checks and the Firestore-emulator browser check on Linux. External requests are blocked. | No |
| `build` | Freezes the release context from the exact commit (`scripts/prepare-booking-release.mjs`), builds once, pushes to Artifact Registry and passes on the image **digest**. | Registry only |
| `candidate` | Deploys that digest as a new revision with **no traffic**, changing only the image, and checks the revision is Ready. The old revision keeps 100%. | New revision, 0% traffic |
| `promote` | Waits for approval on the `production` environment, moves 100% of traffic, smoke-tests the public URL and **rolls back automatically** if the smoke test fails. | Yes, after approval |

The candidate cannot be smoke-tested on its own revision URL: the app only answers on `APP_ORIGIN`, so a tagged URL gets 403. Instead, the revision's Ready check (the app refuses to start when its baked catalogue pins do not match Firestore) runs before approval, and the public smoke test plus automatic rollback run after it.

Pushes that only change docs, the README or submission files do not deploy. The Actions tab also has **Run workflow** to release on demand.

## Access

- **Keyless.** GitHub's short-lived OIDC token is exchanged through Workload Identity Federation. The provider only trusts repository id `1415473235` on `refs/heads/main`. No service-account key exists.
- **Narrow deployer.** `github-deployer@sincere-apex-511418-p0.iam.gserviceaccount.com` has `run.developer` on this one service, read-only `run.viewer`, `serviceAccountUser` on the existing runtime account only, and `artifactregistry.writer` on the `hotel-price-hunter` repository only.
- **Approval.** The `production` environment requires your review and only accepts deployments from `main`.

Set it up once with `pwsh -NoProfile -File scripts/setup-github-deploy.ps1` in your own terminal. It asks before each step and skips what already exists.

## Day to day

- **Release:** merge to `main` (or Actions > Deploy to Cloud Run > Run workflow), then approve **promote** when GitHub asks.
- **Roll back:** Actions > Roll back Cloud Run > Run workflow, enter a revision such as `hotel-price-hunter-00021-sjb`, approve.
- **Catalogue changes:** after a new reviewed catalogue import, update the `ROOMDROP_CATALOGUE_MANIFEST` repo variable (re-run the variables step of the setup script). Firestore imports stay a manual, local step; the pipeline never writes Firestore.

The local guarded script (`.local/deploy-roomdrop.ps1`) still works as a manual fallback.
