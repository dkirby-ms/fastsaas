# EECOM Semantic Versioning Decision

- **Date:** 2026-05-31
- **Owner:** EECOM
- **Context:** Issue #36 asks for a lightweight semantic versioning approach for the API and portal workspaces without adding release automation.
- **Decision:** Keep package versions in `packages/api`, `packages/portal`, and `packages/shared` on plain semantic versions and use `npm version patch|minor|major --workspace=<workspace>` for bumps. Track notable release notes in the root `CHANGELOG.md` using the Keep a Changelog structure.
- **Why:** The team is small, the workspace packages already start at `0.1.0`, and `npm version` keeps the workflow simple while still giving consistent package metadata and release notes.
