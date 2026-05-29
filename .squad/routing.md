# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Architecture & decisions | Kranz | System design, tech choices, scope decisions, trade-offs |
| Code review | Kranz | Review PRs, check quality, approve/reject |
| Frontend & UI | FIDO | Next.js pages, React components, Tailwind styling, portals |
| Backend & APIs | EECOM | REST endpoints, Prisma models, services, webhooks, middleware |
| Database & data | EECOM | PostgreSQL schema, migrations, queries, RLS policies |
| Testing & QA | RETRO | Unit tests, integration tests, E2E, edge cases, test strategy |
| Infrastructure | GNC | Bicep/Terraform, Docker, Container Apps, CI/CD pipelines |
| DevOps & deployment | GNC | Azure resources, GitHub Actions, environments, secrets |
| Observability | GNC + EECOM | OpenTelemetry, logging, metrics, alerting |
| Security & auth | EECOM + Kranz | Authentication, authorization, tenant isolation |
| SDK & shared packages | EECOM | TypeScript SDK, shared types and utilities |
| Scope & priorities | Kranz | What to build next, phase planning, trade-offs |
| Session logging | Scribe | Automatic — never needs routing |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Lead |
| `squad:{name}` | Pick up issue and complete the work | Named member |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, the **Lead** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Lead review.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. The Lead handles all `squad` (base label) triage.
