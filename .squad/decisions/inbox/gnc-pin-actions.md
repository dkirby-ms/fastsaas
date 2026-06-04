# GNC Decision: pin GitHub Actions to commit SHAs

- **Date:** 2026-06-04T13:20:25.015+00:00
- **Owner:** GNC
- **Context:** Issue #132 requires supply-chain hardening across the repository's GitHub Actions workflows. The repo previously referenced remote actions by movable major tags such as `v5`, `v8`, and `v3`, which weakens reproducibility and increases exposure to upstream tag retargeting.
- **Decision:** All remote GitHub Actions under `.github/workflows/` should be pinned to full 40-character commit SHAs and retain the source version as an inline comment. Add `.github/dependabot.yml` with the `github-actions` ecosystem so Dependabot can open PRs when pinned SHAs need to move.
- **Why:** Full SHAs make workflow execution deterministic and satisfy common supply-chain hardening guidance, while the inline version comments preserve readability for operators reviewing workflow changes. Dependabot keeps the hardening maintainable instead of leaving the SHAs to drift manually.
- **Files:** `.github/workflows/*.yml`, `.github/dependabot.yml`
