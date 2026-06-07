## [0.24.0](https://github.com/dkirby-ms/fastsaas/compare/v0.23.3...v0.24.0) (2026-06-07)

### Features

* **#155:** seed dark-mode feature gate for premium-1 plan ([#157](https://github.com/dkirby-ms/fastsaas/issues/157)) ([d00db44](https://github.com/dkirby-ms/fastsaas/commit/d00db4419fe0ebc296397d6276788ba10b49946e)), closes [#155](https://github.com/dkirby-ms/fastsaas/issues/155) [#155](https://github.com/dkirby-ms/fastsaas/issues/155)

## [0.23.3](https://github.com/dkirby-ms/fastsaas/compare/v0.23.2...v0.23.3) (2026-06-07)

### Bug Fixes

* **portal:** hide publisher link from users without publisher role ([#154](https://github.com/dkirby-ms/fastsaas/issues/154)) ([#156](https://github.com/dkirby-ms/fastsaas/issues/156)) ([c03f027](https://github.com/dkirby-ms/fastsaas/commit/c03f0275a9b103e5f9b5f85e3586f582ab3bd5b8)), closes [#131](https://github.com/dkirby-ms/fastsaas/issues/131)

## [0.23.2](https://github.com/dkirby-ms/fastsaas/compare/v0.23.1...v0.23.2) (2026-06-07)

### Bug Fixes

* register plan_feature_gates and feature_definitions in migrator ([bc7d97c](https://github.com/dkirby-ms/fastsaas/commit/bc7d97c2cd5992d7ea588b927d95b6239057c12e))

## [0.23.1](https://github.com/dkirby-ms/fastsaas/compare/v0.23.0...v0.23.1) (2026-06-07)

### Bug Fixes

* JSON.stringify features array before JSONB insert in publisher plans ([125c0c7](https://github.com/dkirby-ms/fastsaas/commit/125c0c72e53bff30e64e2f36182e94792a15494d))

## [0.23.0](https://github.com/dkirby-ms/fastsaas/compare/v0.22.3...v0.23.0) (2026-06-07)

### Features

* plan-gated feature entitlements system with 4 demo features ([#153](https://github.com/dkirby-ms/fastsaas/issues/153)) ([b60f6c3](https://github.com/dkirby-ms/fastsaas/commit/b60f6c30cd6a294f3b8a24f9247b6d6fc2f7cf0a)), closes [#147](https://github.com/dkirby-ms/fastsaas/issues/147) [#148](https://github.com/dkirby-ms/fastsaas/issues/148) [#151](https://github.com/dkirby-ms/fastsaas/issues/151) [#150](https://github.com/dkirby-ms/fastsaas/issues/150) [#152](https://github.com/dkirby-ms/fastsaas/issues/152) [#149](https://github.com/dkirby-ms/fastsaas/issues/149)

## [0.22.3](https://github.com/dkirby-ms/fastsaas/compare/v0.22.2...v0.22.3) (2026-06-07)

### Bug Fixes

* use prefix matching for Partner Center schema versions ([c79fa6e](https://github.com/dkirby-ms/fastsaas/commit/c79fa6e431c954d7d1d55b63d0973b57a4269187))

## [0.22.2](https://github.com/dkirby-ms/fastsaas/compare/v0.22.1...v0.22.2) (2026-06-07)

### Bug Fixes

* extract product from collection response in getProductByExternalId ([b300e9e](https://github.com/dkirby-ms/fastsaas/commit/b300e9e62ba78371eca31bf5f4564f2f9e3b879f))
* log Partner Center product response for import debugging ([86e95b0](https://github.com/dkirby-ms/fastsaas/commit/86e95b034345482249d9abbd9974c04e0c4e9da8))

## [0.22.1](https://github.com/dkirby-ms/fastsaas/compare/v0.22.0...v0.22.1) (2026-06-07)

### Bug Fixes

* add detailed error logging to Partner Center product import ([87553d6](https://github.com/dkirby-ms/fastsaas/commit/87553d6b5e7b5c68cadf3fda5ac69f9488cbdc40)), closes [#131](https://github.com/dkirby-ms/fastsaas/issues/131)

## [0.22.0](https://github.com/dkirby-ms/fastsaas/compare/v0.21.1...v0.22.0) (2026-06-07)

### Features

* add plan_feature_gates table, service, repository, and routes ([#146](https://github.com/dkirby-ms/fastsaas/issues/146)) ([f94099a](https://github.com/dkirby-ms/fastsaas/commit/f94099a6edb58b242a2b630c3f198263a1ff6a35))
* **portal:** add feature gates tab and Partner Center warning to publisher plans ([#146](https://github.com/dkirby-ms/fastsaas/issues/146)) ([cc3c5a0](https://github.com/dkirby-ms/fastsaas/commit/cc3c5a01faad4958a74b08570a11e63ac06cb661))
* **portal:** add Partner Center product import to Marketplace Plans tab ([4eb8ad6](https://github.com/dkirby-ms/fastsaas/commit/4eb8ad6f4385a39eb76eb962f4e4cb0292818675))
* **portal:** migrate publisher plans from priceMonthly to pricingSummary ([#146](https://github.com/dkirby-ms/fastsaas/issues/146)) ([93b94cf](https://github.com/dkirby-ms/fastsaas/commit/93b94cff0c91466451f012097ebb1f74bc53d6a1))
* **publisher-plans:** migrate pricing to marketplace catalog ([#146](https://github.com/dkirby-ms/fastsaas/issues/146)) ([b26ceb8](https://github.com/dkirby-ms/fastsaas/commit/b26ceb81edbf47d3207beafb60133f09fd626260))
* support dual-role portal access ([#144](https://github.com/dkirby-ms/fastsaas/issues/144)) ([5c97831](https://github.com/dkirby-ms/fastsaas/commit/5c978312dbb5ad963d35f6fd7ebc1b4c9f84cf49))

### Bug Fixes

* **api:** rewrite plan-feature-gates test mocks to match real repository interface ([c720805](https://github.com/dkirby-ms/fastsaas/commit/c720805b3ff1787f9f969887ce765f6317eb1b00)), closes [#146](https://github.com/dkirby-ms/fastsaas/issues/146)

## [0.21.1](https://github.com/dkirby-ms/fastsaas/compare/v0.21.0...v0.21.1) (2026-06-06)

### Bug Fixes

* force dynamic rendering on auth-debug page ([7e3dff8](https://github.com/dkirby-ms/fastsaas/commit/7e3dff89855e2b046f1e250cee6a87819a36a144))

## [0.21.0](https://github.com/dkirby-ms/fastsaas/compare/v0.20.0...v0.21.0) (2026-06-06)

### Features

* auth debug tooling for publisher role diagnosis ([#145](https://github.com/dkirby-ms/fastsaas/issues/145)) ([24b735d](https://github.com/dkirby-ms/fastsaas/commit/24b735d361226b2859efba7db8bb91a9cdfa774e))

## [0.20.0](https://github.com/dkirby-ms/fastsaas/compare/v0.19.2...v0.20.0) (2026-06-06)

### Features

* add Publisher role to API RBAC system ([bd722b5](https://github.com/dkirby-ms/fastsaas/commit/bd722b5688b6dad99cdf06549f3b0369993d20ff))

## [0.19.2](https://github.com/dkirby-ms/fastsaas/compare/v0.19.1...v0.19.2) (2026-06-06)

### Bug Fixes

* move publisher portal API calls to server actions ([d2d0df0](https://github.com/dkirby-ms/fastsaas/commit/d2d0df0ac95b1f19fdad9519f473d94cd0071bec))

## [0.19.1](https://github.com/dkirby-ms/fastsaas/compare/v0.19.0...v0.19.1) (2026-06-06)

### Bug Fixes

* restore partner_center_connections migration stub to unbreak staging API ([48fec2a](https://github.com/dkirby-ms/fastsaas/commit/48fec2a5b224bfe64419c6a16df84edce96d8915))

## [0.19.0](https://github.com/dkirby-ms/fastsaas/compare/v0.18.1...v0.19.0) (2026-06-06)

### Features

* plan catalog with marketplace linking, remove multi-publisher and products page ([6543973](https://github.com/dkirby-ms/fastsaas/commit/65439731bc3400eba7dbd01d761ff1f461f706ca))

## [0.18.1](https://github.com/dkirby-ms/fastsaas/compare/v0.18.0...v0.18.1) (2026-06-06)

### Bug Fixes

* build @fastsaas/shared before API and portal in Dockerfiles ([6cda369](https://github.com/dkirby-ms/fastsaas/commit/6cda369a8200dfcdb258349ad8fedee902ad74a5))

## [0.18.0](https://github.com/dkirby-ms/fastsaas/compare/v0.17.12...v0.18.0) (2026-06-05)

### Features

* implement subscription provisioning from Subscribe webhook ([dbe1f44](https://github.com/dkirby-ms/fastsaas/commit/dbe1f44d94823a2a7b17499662c8da0f6888b814))

## [0.17.12](https://github.com/dkirby-ms/fastsaas/compare/v0.17.11...v0.17.12) (2026-06-05)

### Bug Fixes

* graceful marketplace webhook handling for Subscribe/Renew and missing subscriptions ([e577137](https://github.com/dkirby-ms/fastsaas/commit/e577137603336f9d28563f2315ca659bb5245048))
* increase audit-logging test timeout and fix ci-failure-issue broken pipe ([5c71ea0](https://github.com/dkirby-ms/fastsaas/commit/5c71ea01a8a29bd6da57f91e226538632d57f39b))

## [0.17.11](https://github.com/dkirby-ms/fastsaas/compare/v0.17.10...v0.17.11) (2026-06-05)

### Bug Fixes

* add MARKETPLACE_CLIENT_ID and MARKETPLACE_TENANT_ID to staging deploy ([bc3c8ba](https://github.com/dkirby-ms/fastsaas/commit/bc3c8baf3c87beebd00f96da7dfc23672a5b07e6))

## [0.17.10](https://github.com/dkirby-ms/fastsaas/compare/v0.17.9...v0.17.10) (2026-06-04)

### Bug Fixes

* use Azure AD tokens for marketplace fulfillment ([#142](https://github.com/dkirby-ms/fastsaas/issues/142)) ([45f24e1](https://github.com/dkirby-ms/fastsaas/commit/45f24e172bb1467bb2953287e302e317f1d38e83)), closes [#141](https://github.com/dkirby-ms/fastsaas/issues/141) [#141](https://github.com/dkirby-ms/fastsaas/issues/141)

## [0.17.9](https://github.com/dkirby-ms/fastsaas/compare/v0.17.8...v0.17.9) (2026-06-04)

### Bug Fixes

* link /no-subscription page directly to marketplace offer ([#133](https://github.com/dkirby-ms/fastsaas/issues/133)) ([#135](https://github.com/dkirby-ms/fastsaas/issues/135)) ([929995a](https://github.com/dkirby-ms/fastsaas/commit/929995a381266cea1d53438e4109bf5537d2ea9b))

## [0.17.8](https://github.com/dkirby-ms/fastsaas/compare/v0.17.7...v0.17.8) (2026-06-04)

### Bug Fixes

* **api:** rename core_tables migration to sort after existing executed migrations ([4919613](https://github.com/dkirby-ms/fastsaas/commit/491961387ccbc54176241e592cdd540e8814e444))

## [0.17.7](https://github.com/dkirby-ms/fastsaas/compare/v0.17.6...v0.17.7) (2026-06-04)

### Bug Fixes

* **api:** align core tables migration types with test expectations ([8728707](https://github.com/dkirby-ms/fastsaas/commit/8728707291415daa2223838c02b587dc8303552b))
* **api:** register core_tables migration in static migrator ([e5a8d73](https://github.com/dkirby-ms/fastsaas/commit/e5a8d73e8886e0a0688d1cee408b7ac21697d1cb))

## [0.17.6](https://github.com/dkirby-ms/fastsaas/compare/v0.17.5...v0.17.6) (2026-06-04)

### Bug Fixes

* **api:** add initial core tables migration ([1e459d4](https://github.com/dkirby-ms/fastsaas/commit/1e459d40a241ad41217dbf8213a1a192667e3185))

## [0.17.5](https://github.com/dkirby-ms/fastsaas/compare/v0.17.4...v0.17.5) (2026-06-03)

### Bug Fixes

* **api:** return null subscription instead of 404 for portal dashboard ([0d11dfb](https://github.com/dkirby-ms/fastsaas/commit/0d11dfbcbb1ee3425d9ec47e5f52509a16d7b1d2))

## [0.17.4](https://github.com/dkirby-ms/fastsaas/compare/v0.17.3...v0.17.4) (2026-06-03)

### Bug Fixes

* **api:** add retry for Docker container port collision in tests ([66bad6a](https://github.com/dkirby-ms/fastsaas/commit/66bad6a13cef5f44c9738f1796fb08f789bd9b79))

## [0.17.3](https://github.com/dkirby-ms/fastsaas/compare/v0.17.2...v0.17.3) (2026-06-03)

### Bug Fixes

* **api:** fix flaky audit-logging test teardown ([de8b3ba](https://github.com/dkirby-ms/fastsaas/commit/de8b3ba1775df1effecbc6787d8cef93fab4d075))

## [0.17.2](https://github.com/dkirby-ms/fastsaas/compare/v0.17.1...v0.17.2) (2026-06-03)

### Bug Fixes

* **ci:** fix jq quoting in ci-failure-issue workflow ([9c60746](https://github.com/dkirby-ms/fastsaas/commit/9c6074690f7b73586df1b84f9d1373efc36f3b3f))

## [0.17.1](https://github.com/dkirby-ms/fastsaas/compare/v0.17.0...v0.17.1) (2026-06-03)

### Bug Fixes

* **api:** support configurable webhook auth modes ([#130](https://github.com/dkirby-ms/fastsaas/issues/130)) ([36c0841](https://github.com/dkirby-ms/fastsaas/commit/36c0841bb41d17adf1a2ae2005d54eb1256fa15a))

## [0.17.0](https://github.com/dkirby-ms/fastsaas/compare/v0.16.4...v0.17.0) (2026-06-03)

### Features

* **portal:** gate dashboard access for unsubscribed users ([#129](https://github.com/dkirby-ms/fastsaas/issues/129)) ([852cd20](https://github.com/dkirby-ms/fastsaas/commit/852cd20cf376d909b897ec6f395141441fab1de4)), closes [#128](https://github.com/dkirby-ms/fastsaas/issues/128)

## [0.16.4](https://github.com/dkirby-ms/fastsaas/compare/v0.16.3...v0.16.4) (2026-06-03)

### Performance Improvements

* **docker:** consolidate layers from ~34 to ~15 per image ([782b4b5](https://github.com/dkirby-ms/fastsaas/commit/782b4b550718bf1cf0760973eb034d107dc8dfed))

## [0.16.3](https://github.com/dkirby-ms/fastsaas/compare/v0.16.2...v0.16.3) (2026-06-03)

### Bug Fixes

* **portal:** remove mock data for unsubscribed users, show subscribe CTA ([9172f1c](https://github.com/dkirby-ms/fastsaas/commit/9172f1c6dda7a8eb87765ec2abbc01a0719d6dc1))

## [0.16.2](https://github.com/dkirby-ms/fastsaas/compare/v0.16.1...v0.16.2) (2026-06-03)

### Bug Fixes

* atomic container app update — image+env in single call ([0775015](https://github.com/dkirby-ms/fastsaas/commit/07750155f782bb28a160d6780376ffbbdd25db77))

## [0.16.1](https://github.com/dkirby-ms/fastsaas/compare/v0.16.0...v0.16.1) (2026-06-03)

### Bug Fixes

* switch deploy-app-staging to image-only updates ([88fc730](https://github.com/dkirby-ms/fastsaas/commit/88fc730cc0652825bcf515ac0ac40cb3f52d8b44))

## [0.16.0](https://github.com/dkirby-ms/fastsaas/compare/v0.15.0...v0.16.0) (2026-06-03)

### Features

* dark mode toggle + NEXTAUTH_URL custom domain fix ([#125](https://github.com/dkirby-ms/fastsaas/issues/125)) ([7d3b809](https://github.com/dkirby-ms/fastsaas/commit/7d3b809dc8752299cfa44e63de1a4af3b11be6ce)), closes [#84](https://github.com/dkirby-ms/fastsaas/issues/84) [#84](https://github.com/dkirby-ms/fastsaas/issues/84)

## [0.15.0](https://github.com/dkirby-ms/fastsaas/compare/v0.14.4...v0.15.0) (2026-06-03)

### Features

* add listing asset and audience visibility ([#124](https://github.com/dkirby-ms/fastsaas/issues/124)) ([643f37c](https://github.com/dkirby-ms/fastsaas/commit/643f37cfaec712d83b22dff83c998f2069dc4421)), closes [#103](https://github.com/dkirby-ms/fastsaas/issues/103)

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
