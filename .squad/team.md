# Squad Team

> fastsaas

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Kranz | Lead | .squad/agents/kranz/charter.md | 🏗️ Active |
| FIDO | Frontend Dev | .squad/agents/fido/charter.md | ⚛️ Active |
| EECOM | Backend Dev | .squad/agents/eecom/charter.md | 🔧 Active |
| RETRO | Tester | .squad/agents/retro/charter.md | 🧪 Active |
| GNC | DevOps | .squad/agents/gnc/charter.md | ⚙️ Active |
| Scribe | Session Logger | .squad/agents/scribe/charter.md | 📋 Active |
| Ralph | Work Monitor | .squad/agents/ralph/charter.md | 🔄 Active |
| @copilot | Coding Agent | copilot-instructions.md | 🤖 Active |

<!-- copilot-auto-assign: false -->

### @copilot Capability Profile

| Category | Fit | Notes |
|----------|-----|-------|
| Single-file bug fixes | 🟢 | Ideal — scoped, testable |
| Multi-file refactors | 🟢 | Good with clear instructions |
| New feature (scoped) | 🟢 | Works well with issue descriptions |
| Infrastructure (Bicep/IaC) | 🟡 | Can do, but GNC is preferred |
| Complex architecture | 🔴 | Needs human/Lead judgment |
| UI/design decisions | 🟡 | Can implement, not design |
| Database migrations | 🟡 | Simple ones OK, complex → EECOM |
| Test writing | 🟢 | Good at generating test cases |

## Project Context

- **Project:** FastSaaS — Next-generation Microsoft Commercial Marketplace SaaS accelerator
- **User:** dkirby-ms
- **Stack:** Node.js 22, TypeScript, Next.js + React + Tailwind, PostgreSQL + Prisma, Turborepo monorepo
- **Deployment:** Azure Container Apps (default), App Service migration path
- **Created:** 2026-05-29

## Issue Source

- **Repository:** dkirby-ms/fastsaas
- **Connected:** 2026-05-29
- **Filters:** state=open
