# Semantic-release for private npm workspaces

## When to use
Use this pattern when a Turborepo/npm-workspaces repository needs automated semver tags and GitHub releases, but its workspaces are private application packages rather than separately published libraries.

## Pattern
1. Install `semantic-release`, the core plugins, and `conventional-changelog-conventionalcommits` at the repo root.
2. Configure `release.config.js` to release only from `main`, analyze conventional commits, update `CHANGELOG.md`, and run `@semantic-release/npm` with `npmPublish: false` so only the root package version changes.
3. Commit release artifacts with `@semantic-release/git`, typically `CHANGELOG.md`, `package.json`, and `package-lock.json`.
4. Add a GitHub Actions workflow that checks out with full history, installs dependencies with `npm ci`, runs the required validation, and executes `semantic-release` with `GITHUB_TOKEN`.
5. Enforce conventional commits in pull requests with `commitlint` so version calculation stays predictable.

## Files
- `release.config.js`
- `commitlint.config.js`
- `.github/workflows/release.yml`
- `.github/workflows/commitlint.yml`
- `CHANGELOG.md`

## Notes
- Keep the repo root `package.json` version field even if the package is private; semantic-release uses it for manifest updates.
- Full git history (`fetch-depth: 0`) is required so semantic-release can inspect prior tags and commit ranges.
- A single-stream release model works best when the workspaces deploy together and are not published to npm independently.
