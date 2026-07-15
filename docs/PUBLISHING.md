# Publishing `claudeport`

This package publishes to npm using **Trusted Publishing (OIDC)** — GitHub Actions
authenticates to npm with a short-lived token minted per run. **No `NPM_TOKEN` is
stored anywhere.**

- `.github/workflows/ci.yml` — runs typecheck (`pnpm build`) + tests on every push/PR.
- `.github/workflows/release.yml` — on a published GitHub Release, runs tests, builds,
  and publishes via OIDC (with provenance), gated behind the `npm-publish` environment.

The steps in **A–C are one-time setup done by a maintainer** (they can't be automated —
npm has no "pending publisher", so the package must exist before OIDC can be configured).
Once done, **D is the entire release process, forever.**

---

## A. One-time bootstrap — first publish of `0.1.0`

npm won't let you configure a trusted publisher for a package that doesn't exist yet,
so publish the first version manually from your machine using your own npm login (2FA).

1. Check the name is free: `npm view claudeport` → a `404` means it's available.
2. Enable 2FA on your npm account, then `npm login`.
3. Upgrade local npm: `npm install -g npm@latest` (need ≥ 11.5.1).
4. From a clean checkout of `main`: `pnpm install`, then `npm publish`.
   - The `prepublishOnly` hook auto-runs `pnpm build && pnpm test`. Enter your 2FA OTP if prompted.
   - This bootstrap publish has **no provenance** (provenance needs CI OIDC) — that's expected.
5. Confirm: `npm view claudeport version` → `0.1.0`.

## B. Configure the trusted publisher on npmjs.com (package now exists)

1. Go to `https://www.npmjs.com/package/claudeport/access` →
   **Trusted Publisher** → Add → **GitHub Actions**.
2. Enter these values **exactly** (case-sensitive):
   | Field                 | Value                                                    |
   | --------------------- | -------------------------------------------------------- |
   | Organization or user  | `radekBednarik`                                          |
   | Repository            | `claudeport`                                            |
   | Workflow filename     | `release.yml` &nbsp;(filename only — **not** the path)   |
   | Environment           | `npm-publish`                                            |
   | Allowed action        | `npm publish`                                            |
3. Save. (npm doesn't validate the config until the first OIDC publish.)

## C. GitHub repo setup

1. Confirm `radekBednarik/claudeport` is **public** (required for provenance to be generated).
2. **Settings → Environments → New environment** → name it `npm-publish` → add
   **yourself as a Required reviewer** (optionally limit deployment branches to `main`).
   The name must match step B exactly.
3. Do **NOT** create an `NPM_TOKEN` secret — OIDC handles auth. No secrets are needed at all.
4. **Settings → Actions → General**: ensure Actions are enabled. (The workflow declares its
   own `permissions:` block, so the default token permissions are fine.)
5. Merge `package.json`, both workflow files, and this doc to `main`.

---

## D. Cutting a release (the whole ongoing process)

1. Bump the version and tag it:
   ```sh
   npm version patch   # or: minor / major
   git push --follow-tags
   ```
2. Create a GitHub Release on that tag:
   ```sh
   gh release create vX.Y.Z --generate-notes
   ```
3. `release.yml` starts and **pauses for approval** on the `npm-publish` environment.
   Open the run in the **Actions** tab and click **Approve**.
4. It publishes to npm via OIDC, with provenance attached.

**Verify:** `npm view claudeport version` shows the new version, and the package page on
npmjs.com shows a **provenance / "Published via GitHub Actions"** badge.

## References

- [npm Trusted Publishers docs](https://docs.npmjs.com/trusted-publishers/)
- [npm provenance docs](https://docs.npmjs.com/generating-provenance-statements/)
- [GitHub changelog: npm trusted publishing GA](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/)
- [npm/cli#8544 — no pending-publisher / first-publish limitation](https://github.com/npm/cli/issues/8544)
