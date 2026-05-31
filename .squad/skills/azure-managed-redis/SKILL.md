---
name: "azure-managed-redis"
description: "Provision Azure Managed Redis in FastSaaS Bicep without legacy Azure Cache for Redis workarounds"
domain: "infrastructure"
confidence: "high"
source: "observed"
tools:
  - name: "web_fetch"
    description: "Pull Microsoft Learn ARM/Bicep references for redisEnterprise resources"
    when: "Confirming supported API versions, SKU names, and child resources"
---

## Context
Use this skill when FastSaaS infrastructure needs a managed Redis cache in Azure. The project should no longer deploy legacy `Microsoft.Cache/Redis` resources or keep environment-specific bypass flags for Redis provisioning.

## Patterns
- Provision Azure Managed Redis with a `Microsoft.Cache/redisEnterprise` cluster plus a `Microsoft.Cache/redisEnterprise/databases` child resource.
- Prefer the Memory Optimized entry SKU `MemoryOptimized_M10` for the lowest-cost managed option requested by the user.
- Configure the database for encrypted clients on port `10000`, enable access-key authentication, and fetch the connection secret with `redisDatabase.listKeys().primaryKey`.
- For private networking, use private endpoint `groupId` `redisEnterprise` and private DNS zone `privatelink.redis.azure.net`.
- Keep staging in `centralus` so Redis, PostgreSQL, and Container Apps stay co-located.

## Examples
- `infrastructure/bicep/modules/redis-cache.bicep`
- `infrastructure/bicep/main.bicep`
- `.github/workflows/deploy-staging.yml`

## Anti-Patterns
- Do not deploy legacy `Microsoft.Cache/Redis` resources.
- Do not keep `deployRedis=false` workflow overrides once Azure Managed Redis is in place.
- Do not use the retired Redis private DNS zone `privatelink.redis.cache.windows.net` for Azure Managed Redis.
