# GNC Semantic Release Decision

- **Date:** 2026-05-31T20:19:20.148+00:00
- **Owner:** GNC
- **Context:** Issue #60 requires strict semver.org automation for the FastSaaS monorepo while the npm workspaces remain private application packages.
- **Decision:** Manage releases from the repository root with `semantic-release` on `main`, treat the monorepo as a single release stream, and use conventional commits plus `commitlint` to drive version calculation, changelog generation, GitHub releases, and version bumps in the root manifests only.
- **Why:** The API, portal, and shared workspaces ship together as one product, so a repository-wide release process keeps tags, changelog entries, and deployment automation aligned without pretending the private workspaces are independently published npm packages.
