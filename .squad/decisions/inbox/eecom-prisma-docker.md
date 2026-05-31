# EECOM Prisma Docker Compatibility Decision

- **Date:** 2026-05-31T18:54:21.897+00:00
- **Owner:** EECOM
- **Context:** The staging API container crashed during Prisma startup on `node:22-alpine` because the generated musl engine required `libssl.so.1.1`, while current Alpine images provide OpenSSL 3.x libraries.
- **Decision:** Standardize the API container on `node:22-slim` and explicitly generate Prisma engines for `native` and `debian-openssl-3.0.x` in `packages/api/prisma/schema.prisma`. Install the `openssl` package in the runtime image so Prisma has the expected runtime dependency available.
- **Why:** Debian slim matches Prisma's recommended OpenSSL/runtime combination, avoids Alpine musl compatibility issues, and keeps local/native development working while ensuring the container ships a compatible query engine.
- **Files:** `packages/api/Dockerfile`, `packages/api/prisma/schema.prisma`
- **Validation:** `npm run build --workspace=@fastsaas/api`, `npm run typecheck --workspace=@fastsaas/api`
