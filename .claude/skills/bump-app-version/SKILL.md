---
name: bump-app-version
description: Bumps the app version that https://smrr.tv/version returns (APP_VERSION in worker/wrangler.jsonc) and ships it in a PR. Use when the developer says "bump to 1.0.1", "bump the version", "set the app version to X", "release X is out, update /version", or wants to roll /version back.
---

# Bump the app version

`GET https://smrr.tv/version` answers `{"version":"<APP_VERSION>"}`: the newest MirrorGo app release
known to work with smrr.tv. The app compares it with its own version and tells the user to update. The
value is the `APP_VERSION` var in `worker/wrangler.jsonc`; a merge to `main` that touches `worker/`
deploys it (`.github/workflows/deploy-worker.yml`).

## Input

The new version, e.g. "bump to 1.0.1". It must be `MAJOR.MINOR.PATCH` (a leading `v` is dropped). If
the developer didn't give one, ask; don't guess the next number.

Every phone on an older version gets told to update as soon as this deploys. If the release isn't live
in the App Store yet, say so and ask before going on.

## Steps

1. Start from fresh `main` unless already on a branch for this:
   `git fetch origin && git switch -c <user>/bump-app-version-<version> origin/main`.
2. Set it (refuses a bad, equal or older version):
   ```bash
   node .claude/skills/bump-app-version/scripts/bump.mjs <version>
   ```
   Rolling back to an older version (e.g. a release turned out broken): only when the developer asks
   for it, add `--allow-lower`.
3. Check it:
   ```bash
   cd worker && npm ci && npm run typecheck && npm test
   ```
   `npm ci` regenerates `worker-configuration.d.ts`, where `APP_VERSION` is typed as the literal value.
4. Commit only `worker/wrangler.jsonc`:
   `chore(worker): smrr.tv/version → <version>` (rollback: `… back to <version>`).
5. Push and open a PR to `main`. Title as the commit; body: old → new version, that merging deploys it
   and phones below it are told to update, and the test result.
6. Report the PR link. After the developer merges and the deploy workflow finishes, check it with
   `curl -s https://smrr.tv/version`.

Don't change the `"1.0.0"` example in `PROTOCOL.md`; it's the response format, not the current value.
