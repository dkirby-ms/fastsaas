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
