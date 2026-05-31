# GNC Portal Dockerfile Standard

- **Date:** 2026-05-31T14:00:03.033+00:00
- **Owner:** GNC
- **Context:** The portal placeholder image failed in Azure Container Registry builds because inline file generation relied on shell-sensitive template literals and a BuildKit-only heredoc `COPY` pattern.
- **Decision:** Placeholder container images should keep their runtime source files in the repository and use plain `COPY` instructions from the repo-root Docker build context instead of inline `node -e` generation or heredoc-based file creation.
- **Why:** Azure Container Registry's Docker builder does not support BuildKit heredoc syntax consistently, and inline shell-generated JavaScript is fragile when template literals or quoting are involved. Repository-backed source files produce portable Dockerfiles that work in local Docker and ACR builds.
- **Files:** `packages/portal/Dockerfile`, `packages/portal/placeholder/package.json`, `packages/portal/placeholder/server.mjs`
