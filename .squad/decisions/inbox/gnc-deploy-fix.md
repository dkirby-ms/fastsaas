# GNC deploy fix inbox

- **Date:** 2026-05-31T00:58:06.780+00:00
- **Owner:** GNC
- **Context:** Issue #25 showed the staging bootstrap path is sensitive to Azure offer restrictions and service retirements.
- **Decision proposal:** Default manual staging deploys to `centralus` instead of `westus2`, and explicitly pass `deployRedis=false` until the stack is migrated from retired Azure Cache for Redis to Azure Managed Redis.
- **Why:** Validation on branch `gnc/25-fix-staging-bootstrap` showed `centralus` succeeds past `Bootstrap shared infrastructure`, while `westus2` and `eastus2` are blocked by PostgreSQL offer restrictions and Redis creation now fails during bootstrap if left enabled.
- **Follow-up:** Plan a separate infrastructure change to migrate Redis-dependent environments to Azure Managed Redis before re-enabling cache provisioning.
