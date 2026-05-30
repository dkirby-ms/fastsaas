# GNC Deploy Failure Issue

- **Date:** 2026-05-30T17:20:36.580+00:00
- **Owner:** GNC
- **Context:** Issue #15 requires staging deploy failures to raise a triageable GitHub issue without coupling failure-handling logic into the deployment workflow itself.
- **Decision:** Add a dedicated `workflow_run` workflow at `.github/workflows/deploy-staging-failure-issue.yml` that listens for failed `Deploy staging` runs, derives the failing job and step from the Actions API, and creates or updates a `squad`-labeled issue keyed by branch/job/step.
- **Implications:** Deployment and incident reporting stay separated, repeated failures for the same branch and failing step stay deduplicated, and squad triage workflows can pick up the generated issue automatically.
