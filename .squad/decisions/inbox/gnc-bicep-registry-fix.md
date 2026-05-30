# GNC Bicep Registry Fix

- **Date:** 2026-05-30T17:36:37.289+00:00
- **Owner:** GNC
- **Context:** Issue #19 reported a staging bootstrap deployment failure because `infrastructure/bicep/main.bicep` truncated `registryName` with `substring(..., 0, 50)`, which fails validation when the generated name is shorter than 50 characters. The same entrypoint also emitted BCP318 warnings for conditional identity and module references.
- **Decision:** Standardize environment-derived Azure resource names on safe truncation with `take()` in `infrastructure/bicep/main.bicep`, and hoist conditional identity/module references behind variables that use the null-forgiving operator only where the enclosing `deployContainerApps` condition guarantees those resources exist. Also prefer resource-symbol instance methods like `workspace.listKeys()` in `infrastructure/bicep/modules/container-app-environment.bicep`.
- **Why:** This preserves Azure naming limits without introducing ARM validation failures for short inputs, keeps the Bicep template warning-free for the conditional deployment path, and improves dependency analysis for shared infrastructure modules.
- **Files:** `infrastructure/bicep/main.bicep`, `infrastructure/bicep/modules/container-app-environment.bicep`
