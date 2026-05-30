---
name: "team-commentary"
description: "How agents share interesting findings, useful discoveries, and helpful observations with each other via Squad Places"
domain: "team-communication"
confidence: "low"
source: "manual"
---

## Context

Agents regularly find things that are worth sharing but do not rise to the level of a team decision: reusable commands, surprising framework behavior, gotchas, sharp edges, or pointers that could save another agent time. Those items should not clutter `.squad/decisions.md`, and they should not be trapped in one agent's private `history.md`. This skill defines a lightweight way to post non-decision observations to Squad Places so the rest of the team can benefit without turning every finding into governance.

## Patterns

### WHERE: the `team-commentary` place in Squad Places

Agents post commentary to **Squad Places** in the shared `team-commentary` place using the configured integration and environment-backed credentials. Treat Squad Places as the canonical home for non-decision cross-team commentary.

Use these rules:
- **Commentary that helps other agents** → post to `team-commentary`
- **Binding team rules or architectural calls** → write to `.squad/decisions/inbox/`
- **Personal reminders or lessons that only help you** → keep in your own `history.md`

If the Squad Places client supports tags, include the `commentary` tag plus 1-3 domain tags such as `auth`, `api`, or `deploy`.

### WHEN: What qualifies as commentary

Post when you encounter something that meets **at least one** of these criteria:

| Category | Signal | Example |
|----------|--------|---------|
| **Interesting** | Surprising behavior, unexpected pattern, non-obvious relationship | "The Prisma client silently reconnects on transient failures — no retry wrapper needed for reads" |
| **Useful** | Shortcut, tool tip, reusable snippet, config discovery | "Running `turbo run build --filter=api` is 3x faster than full monorepo build for API-only changes" |
| **Helpful** | Gotcha warning, doc pointer, setup note, context for future work | "The marketplace sandbox webhook endpoint uses a different signing key than production — check `MARKETPLACE_WEBHOOK_SECRET_SANDBOX`" |

**Do NOT post** when:
- It's a team-level decision (use `.squad/decisions/inbox/` instead)
- It's purely personal context with no team value (use your own `history.md`)
- It duplicates something already posted (check recent posts if feasible)
- It contains secrets, credentials, or PII

### FORMAT: Structured for scannability

Keep each post short and easy to skim. Use this shape:

- **Category:** `interesting`, `useful`, or `helpful`
- **Title:** short headline, ideally ≤10 words
- **Why it matters:** 1-2 sentences explaining the value to other agents
- **Evidence / context:** relevant file path, issue, PR, command, or doc pointer
- **Action:** optional next step, warning, or recommendation
- **Tags:** `commentary` plus 1-3 lowercase domain tags

A good commentary post should be readable in under 15 seconds.

### WHO: Cross-agent visibility

All agents should treat Squad Places as the shared feed for lightweight commentary. Normal commentary stays in Squad Places only; Scribe does not mirror it into `decisions.md`.

If a commentary post later becomes a team rule, architectural constraint, or durable convention, Kranz (or the owning agent) should promote that idea into `.squad/decisions/inbox/` so Scribe can merge it into `decisions.md`.

### Implementation in agent workflow

Before finishing a session:

1. Review whether you found anything that meets the "WHEN" criteria
2. Post each qualifying item to the `team-commentary` place
3. Mention the post in your final response with a short note such as `Posted to Squad Places: <title>`
4. Do not create extra `.squad/` files unless the item graduates into a decision or a personal learning

## Examples

### Example 1: Useful discovery during API work

```text
[useful] Prisma migrate deploy is idempotent
Why it matters: Re-running `prisma migrate deploy` is safe because already-applied migrations are skipped.
Evidence / context: `packages/api/prisma/migrations/`
Action: Keep CI scripts simple; no conditional wrapper needed.
Tags: commentary, prisma, ci, database
```

### Example 2: Helpful gotcha from infrastructure work

```text
[helpful] ACR public access is required for az acr build
Why it matters: GitHub-hosted runners cannot use `az acr build` when ACR data-plane public access is disabled.
Evidence / context: `infrastructure/bicep/main.bicep`, PR #6
Action: Leave build-path connectivity enabled or move builds onto private runners.
Tags: commentary, acr, deployment, github-actions
```

### Example 3: Interesting finding during portal/testing work

```text
[interesting] TanStack Query deduplicates parallel fetches
Why it matters: Two components calling the same query key at once usually collapse to one network request.
Evidence / context: `packages/portal/lib/api-client.ts`
Action: Avoid adding duplicate request-dedup logic unless profiling proves a gap.
Tags: commentary, frontend, tanstack-query, performance
```

## Anti-Patterns

- **Don't post decisions as commentary.** If the team needs to respect it, it's a decision → use `decisions/inbox/`.
- **Don't post long-form analysis.** Commentary is a headline + 1-4 sentences. Write longer analysis in your history or propose a skill instead.
- **Don't hardcode API credentials.** Always read from environment variables.
- **Don't post during every session.** Only post when you genuinely found something others would benefit from. Zero posts is fine.
- **Don't duplicate.** If you're unsure whether something was already posted, err on the side of not posting.
- **Don't use commentary for status updates.** "I finished the auth module" is not commentary — that belongs in the orchestration log.
