## [0.14.4](https://github.com/dkirby-ms/fastsaas/compare/v0.14.3...v0.14.4) (2026-06-03)

### Bug Fixes

* rename .squad/ files to remove colons for Windows compatibility ([7ceaaf6](https://github.com/dkirby-ms/fastsaas/commit/7ceaaf6e5a398c7d8d9bbeb306e0bc56c7c74282))

## [0.14.3](https://github.com/dkirby-ms/fastsaas/compare/v0.14.2...v0.14.3) (2026-06-03)

### Bug Fixes

* qualify ambiguous id column in metering claimDueBatch query ([ca9015f](https://github.com/dkirby-ms/fastsaas/commit/ca9015f5db1bb3c4485835163aeeac96cb193234))

## [0.14.2](https://github.com/dkirby-ms/fastsaas/compare/v0.14.1...v0.14.2) (2026-06-03)

### Bug Fixes

* **infra:** provision secrets via Bicep params instead of post-deploy mutation ([#122](https://github.com/dkirby-ms/fastsaas/issues/122)) ([79e3e2e](https://github.com/dkirby-ms/fastsaas/commit/79e3e2e20972a7bf71aeb36b648530687f8945b2))

## [0.14.1](https://github.com/dkirby-ms/fastsaas/compare/v0.14.0...v0.14.1) (2026-06-02)

### Bug Fixes

* **portal:** case-insensitive USE_MOCK_API comparison ([1e70c09](https://github.com/dkirby-ms/fastsaas/commit/1e70c0961db8fcae0d8de059641b75c1e6367685))

## [0.14.0](https://github.com/dkirby-ms/fastsaas/compare/v0.13.1...v0.14.0) (2026-06-02)

### Features

* **infra:** wire USE_MOCK_API and API_BASE_URL for portal container app ([e269056](https://github.com/dkirby-ms/fastsaas/commit/e269056e4d931508a732cb618129dfb6265f3224))

## [0.13.1](https://github.com/dkirby-ms/fastsaas/compare/v0.13.0...v0.13.1) (2026-06-02)

### Bug Fixes

* URL-encode Postgres password in DATABASE_URL construction ([bfe28b8](https://github.com/dkirby-ms/fastsaas/commit/bfe28b85d5d3b6f7ee14629b2c6d24f264813a43)), closes [#120](https://github.com/dkirby-ms/fastsaas/issues/120)

## [0.13.0](https://github.com/dkirby-ms/fastsaas/compare/v0.12.0...v0.13.0) (2026-06-02)

### Features

* **api:** add submission status monitoring endpoints ([#102](https://github.com/dkirby-ms/fastsaas/issues/102)) ([#119](https://github.com/dkirby-ms/fastsaas/issues/119)) ([08d4581](https://github.com/dkirby-ms/fastsaas/commit/08d458173fe780f30f714c0192a26acb988204b0))

## [0.12.0](https://github.com/dkirby-ms/fastsaas/compare/v0.11.3...v0.12.0) (2026-06-02)

### Features

* **api:** marketplace OAuth service & Product Ingestion API routes ([#78](https://github.com/dkirby-ms/fastsaas/issues/78)) ([#116](https://github.com/dkirby-ms/fastsaas/issues/116)) ([108ee2f](https://github.com/dkirby-ms/fastsaas/commit/108ee2f732e870fcfa55ee8d5963a06bfcbff989))

## [0.11.3](https://github.com/dkirby-ms/fastsaas/compare/v0.11.2...v0.11.3) (2026-06-02)

### Bug Fixes

* **scripts:** add MARKETPLACE_METERING_API_KEY to set-secrets helpers ([#73](https://github.com/dkirby-ms/fastsaas/issues/73)) ([#114](https://github.com/dkirby-ms/fastsaas/issues/114)) ([dc29aea](https://github.com/dkirby-ms/fastsaas/commit/dc29aea794c2092003d75ab9bcbc9f4ac042303b))

## [0.11.2](https://github.com/dkirby-ms/fastsaas/compare/v0.11.1...v0.11.2) (2026-06-02)

### Bug Fixes

* **infra:** provision marketplace API secrets in staging ([#73](https://github.com/dkirby-ms/fastsaas/issues/73)) ([#113](https://github.com/dkirby-ms/fastsaas/issues/113)) ([b41a6d4](https://github.com/dkirby-ms/fastsaas/commit/b41a6d4b0f844471edea38c48b10f299e84e86a0))

## [0.11.1](https://github.com/dkirby-ms/fastsaas/compare/v0.11.0...v0.11.1) (2026-06-02)

### Bug Fixes

* **api:** prioritize unpolled marketplace jobs ([#112](https://github.com/dkirby-ms/fastsaas/issues/112)) ([4dc5d39](https://github.com/dkirby-ms/fastsaas/commit/4dc5d398f471c7e70d77a332add25fa556e5aba8))

## [0.11.0](https://github.com/dkirby-ms/fastsaas/compare/v0.10.0...v0.11.0) (2026-06-02)

### Features

* **api:** add Partner Center product import and sync ([#111](https://github.com/dkirby-ms/fastsaas/issues/111)) ([45ba129](https://github.com/dkirby-ms/fastsaas/commit/45ba1299fc59aeb070fb21e1d0804ed735933654)), closes [#100](https://github.com/dkirby-ms/fastsaas/issues/100)

## [0.10.0](https://github.com/dkirby-ms/fastsaas/compare/v0.9.1...v0.10.0) (2026-06-02)

### Features

* **api:** add Product Ingestion API client library ([#98](https://github.com/dkirby-ms/fastsaas/issues/98)) ([#110](https://github.com/dkirby-ms/fastsaas/issues/110)) ([bde8882](https://github.com/dkirby-ms/fastsaas/commit/bde8882e1c4fbd954c655d1f5eb77781225ea53b))

## [0.9.1](https://github.com/dkirby-ms/fastsaas/compare/v0.9.0...v0.9.1) (2026-06-02)

### Bug Fixes

* **api:** wrap metering route handlers with try/catch for Express 4 async error handling ([ca5f0ea](https://github.com/dkirby-ms/fastsaas/commit/ca5f0eab962ec678b9dfc7becf17df14495f0c6e)), closes [#109](https://github.com/dkirby-ms/fastsaas/issues/109)

## [0.9.0](https://github.com/dkirby-ms/fastsaas/compare/v0.8.2...v0.9.0) (2026-06-02)

### Features

* add Partner Center connection ([#97](https://github.com/dkirby-ms/fastsaas/issues/97)) ([#108](https://github.com/dkirby-ms/fastsaas/issues/108)) ([14e3f17](https://github.com/dkirby-ms/fastsaas/commit/14e3f174c086181444a4072c9247a55871f41ed9))

## [0.8.2](https://github.com/dkirby-ms/fastsaas/compare/v0.8.1...v0.8.2) (2026-06-01)

### Bug Fixes

* add RBAC and tenant ownership check to metering endpoint ([#94](https://github.com/dkirby-ms/fastsaas/issues/94)) ([44a67e3](https://github.com/dkirby-ms/fastsaas/commit/44a67e38d3f00dade9d675ec7978cc5de0085c2a))
* fail startup when critical secrets are missing instead of using defaults ([#93](https://github.com/dkirby-ms/fastsaas/issues/93)) ([75a7289](https://github.com/dkirby-ms/fastsaas/commit/75a72893c4a3ffb444e3597fffbd35c16e9f3c9d))
* sanitize upstream error details before returning to clients ([#96](https://github.com/dkirby-ms/fastsaas/issues/96)) ([b6cce4f](https://github.com/dkirby-ms/fastsaas/commit/b6cce4fa075cb34d23c32e17742a929f6780ec3f))

## [0.8.1](https://github.com/dkirby-ms/fastsaas/compare/v0.8.0...v0.8.1) (2026-06-01)

### Bug Fixes

* encode dynamic path segments in publisher portal API client ([#95](https://github.com/dkirby-ms/fastsaas/issues/95)) ([6cf0534](https://github.com/dkirby-ms/fastsaas/commit/6cf05345fcc20c16bef752817d3b778ef4830ecf))
* redact marketplace purchase tokens from audit data and API responses ([#92](https://github.com/dkirby-ms/fastsaas/issues/92)) ([a146cf0](https://github.com/dkirby-ms/fastsaas/commit/a146cf05a569b119c622b18feae56868e66ca83a))

## [0.8.0](https://github.com/dkirby-ms/fastsaas/compare/v0.7.0...v0.8.0) (2026-06-01)

### Features

* implement customer RBAC with tenant membership ([#76](https://github.com/dkirby-ms/fastsaas/issues/76)) ([#86](https://github.com/dkirby-ms/fastsaas/issues/86)) ([370dde3](https://github.com/dkirby-ms/fastsaas/commit/370dde30d5cf78db485c601e82a0a17c3c384430))

## [0.7.0](https://github.com/dkirby-ms/fastsaas/compare/v0.6.0...v0.7.0) (2026-06-01)

### Features

* **api:** add Marketplace change webhook handlers ([#82](https://github.com/dkirby-ms/fastsaas/issues/82)) ([b958b8d](https://github.com/dkirby-ms/fastsaas/commit/b958b8d6cf8b706f8cd7c15f59b1e554e0a2c5f1)), closes [#75](https://github.com/dkirby-ms/fastsaas/issues/75)
* implement Marketplace landing page onboarding flow ([#81](https://github.com/dkirby-ms/fastsaas/issues/81)) ([66e1241](https://github.com/dkirby-ms/fastsaas/commit/66e12411fcb7518eb3d5379787c56d9716db6223)), closes [#79](https://github.com/dkirby-ms/fastsaas/issues/79)

## [0.6.0](https://github.com/dkirby-ms/fastsaas/compare/v0.5.0...v0.6.0) (2026-06-01)

### Features

* add secret provisioning helper scripts for Windows and Unix ([91faf33](https://github.com/dkirby-ms/fastsaas/commit/91faf33368f9f2bdfb7a3029052f0a3d77a91493))

## [0.5.0](https://github.com/dkirby-ms/fastsaas/compare/v0.4.3...v0.5.0) (2026-06-01)

### Features

* multi-tenant auth and beneficiary tenant binding ([#80](https://github.com/dkirby-ms/fastsaas/issues/80)) ([4cbbfa9](https://github.com/dkirby-ms/fastsaas/commit/4cbbfa9834ad206e1bcd710fc36b32f976365bdb))

## [0.4.3](https://github.com/dkirby-ms/fastsaas/compare/v0.4.2...v0.4.3) (2026-06-01)

### Bug Fixes

* wire up Tailwind v4 PostCSS pipeline for portal ([ce8d748](https://github.com/dkirby-ms/fastsaas/commit/ce8d74853c063653e1eced444d0b212be4619e46))

## [0.4.2](https://github.com/dkirby-ms/fastsaas/compare/v0.4.1...v0.4.2) (2026-06-01)

### Bug Fixes

* add AUTH_TRUST_HOST=true to portal staging env ([c6a03e1](https://github.com/dkirby-ms/fastsaas/commit/c6a03e1cce5d53c1f8d8fa6478755c952827c09e))

## [0.4.1](https://github.com/dkirby-ms/fastsaas/compare/v0.4.0...v0.4.1) (2026-06-01)

### Bug Fixes

* **deploy:** add missing env vars to portal environment step ([597fa43](https://github.com/dkirby-ms/fastsaas/commit/597fa43909e4f1eaf8e03b897725d0bc1c7bd08d))
* rename AZURE_AD_* to ENTRA_* in tenant-rls integration test ([0f26b08](https://github.com/dkirby-ms/fastsaas/commit/0f26b080b88e416605d97488960be21999970cbc))

## [0.4.0](https://github.com/dkirby-ms/fastsaas/compare/v0.3.0...v0.4.0) (2026-06-01)

### Features

* **portal:** Replace placeholder with real Next.js Dockerfile ([#66](https://github.com/dkirby-ms/fastsaas/issues/66)) ([efa0a8f](https://github.com/dkirby-ms/fastsaas/commit/efa0a8f0dfed3f9019ced095550dc84283384860))

## [0.3.0](https://github.com/dkirby-ms/fastsaas/compare/v0.2.0...v0.3.0) (2026-06-01)

### Features

* **api:** add publisher management routes ([#43](https://github.com/dkirby-ms/fastsaas/issues/43)) ([63d6b1b](https://github.com/dkirby-ms/fastsaas/commit/63d6b1b8f8829d022d0ec64fbe4b6f6093376e8d))

### Bug Fixes

* **portal:** harden publisher workflow adapters ([3e78edc](https://github.com/dkirby-ms/fastsaas/commit/3e78edc3d7010df12c8f4f9fc4b574780099c0d4))
* scope publisher service queries through tenant RLS context ([7be292b](https://github.com/dkirby-ms/fastsaas/commit/7be292b0220d5442b87bef90330cd882402e3f52))

## [0.2.0](https://github.com/dkirby-ms/fastsaas/compare/v0.1.1...v0.2.0) (2026-06-01)

### Features

* **api:** enforce tenant middleware and RLS ([#45](https://github.com/dkirby-ms/fastsaas/issues/45)) ([d82cb3d](https://github.com/dkirby-ms/fastsaas/commit/d82cb3d88542fa946765e2c40b66e908a6350734))

### Bug Fixes

* **api:** wire tenant RLS migrations ([240292c](https://github.com/dkirby-ms/fastsaas/commit/240292c734f357704a254f6d12f391ebe673ed26))
* wire tenant RLS migration rollout ([232fd5d](https://github.com/dkirby-ms/fastsaas/commit/232fd5d5df8f06671d2400858b5a8611c02956d4))

## [0.1.1](https://github.com/dkirby-ms/fastsaas/compare/v0.1.0...v0.1.1) (2026-06-01)

### Bug Fixes

* **docs:** add real metering recovery procedures ([#46](https://github.com/dkirby-ms/fastsaas/issues/46)) ([0ab770e](https://github.com/dkirby-ms/fastsaas/commit/0ab770eeea907b8265bf344e8917d967cc856637))
* harden webhook and metering validation ([f018e2d](https://github.com/dkirby-ms/fastsaas/commit/f018e2d62a51a12f63a60b63fe64a65e08a61342))

# Changelog

All notable changes to FastSaaS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Documented that releases are now automated from `main` with `semantic-release` and conventional commits.
- Documented the `POST /v1/subscriptions` migration: clients must stop sending `planId` and `seats`; FastSaaS now derives both values from Marketplace resolve. See `docs/migrations/multi-tenant-auth.md`.

## [0.1.0] - 2026-05-31

### Added
- Initial FastSaaS workspace baseline for the API, portal, and shared packages.
