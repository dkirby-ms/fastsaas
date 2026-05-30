# EECOM PostgreSQL Public Firewall Decision

- **Date:** 2026-05-30T21:21:50.014+00:00
- **Owner:** EECOM
- **Context:** PR #24 introduced a public PostgreSQL mode by omitting delegated subnet/private DNS wiring, but Azure Database for PostgreSQL Flexible Server still blocks public clients unless firewall rules are defined.
- **Decision:** Treat "no delegated subnet" as public mode and create PostgreSQL Flexible Server firewall rules only in that mode: `AllowAzureServices` (`0.0.0.0` to `0.0.0.0`) for Azure-hosted callers and `AllowAllDev` (`0.0.0.0` to `255.255.255.255`) for dev/staging convenience.
- **Why:** This preserves the private-network posture when VNet integration is enabled while making the non-private path actually reachable for Container Apps and developer access.
- **Who should act:** GNC/Kranz can merge the infra fix; future public-mode changes should keep firewall behavior coupled to the networking mode.
