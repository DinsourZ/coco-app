# AGENTS.md — CoCo App Multi-Agent Governance

This repository (`DinsourZ/coco-app`, display name **CoCo App**) is the **public** native Android/iOS companion application for CoCo OS. The backend, firmware, mechanical designs, databases, and operational deployment remain strictly inside the **private** `DinsourZ/coco-os` repository.

## Roles & Ownership

| Agent | Role | Responsibilities |
|---|---|---|
| **Muse** | Task Coordinator & Code Review Supervisor | Breaks down roadmap milestones into GitHub Issues, assigns scoped tasks, reviews PRs for architecture/security/safety compliance, and approves merges into `main`. |
| **Gemini** | Chief Architect & Migration Engineer | Executed Phase-1 extraction from `coco-os` (`integration/coco-full-recovery-20261114` @ `8b981d7befd6c733f4b7b5942cabd4a64d8f92c8`), established the native Expo React Native + TypeScript architecture, security audit gates, and CI baseline. |
| **Annie's & Authorized Sub-Agents** | Scoped Feature & QA Executors | Execute explicitly assigned GitHub Issues (Android/iOS builds, UI polish, voice/audio integration, device control views) only after authorization and within branch/PR guardrails. |

## Non-Negotiable Engineering & Security Guardrails

1. **Branch & PR Only**: Never push directly to protected `main` after initial bootstrap. Every agent must work on an isolated feature branch (`feat/...`, `fix/...`, `docs/...`, `chore/...`) and open a Pull Request for review by **Muse** or the repository owner.
2. **No Secrets or Private Infrastructure**:
   - Never commit `.env` files, API keys, Bearer tokens, SSH keys, TLS private keys, production URLs, RFC1918 LAN IPs, Tailscale domains, database files, or logs.
   - All test fixtures must be 100% synthetic.
3. **No Production Deployment or Secrets Access**:
   - Agents must **never** deploy to production servers or request/receive production credentials or AI provider keys.
   - External PR CI workflows must never read production secrets.
4. **Client-Side Safety Invariants**:
   - All final authorization, policy enforcement, and physical safety limits remain server-side in private CoCo OS.
   - Never bypass backend policy, never suppress or fake `STOP` outcomes, and never attach `X-CoCo-Control-*` precondition headers to `POST /api/devices/{id}/motion/stop`.
   - Access tokens (`console`, `approver`, `audit`) and one-time pairing codes / rotated device tokens must stay in volatile memory only — never written to URLs, cookies, logs, or plaintext disk storage.
5. **Honest Status Reporting**:
   - Unimplemented capabilities (voice capture, native audio playback, push notifications) must remain clearly labeled `TODO` / `not_implemented`. Never fabricate success or mock away errors in Live Mode.
6. **License Hygiene**:
   - Do not copy GPL/AGPL or hardware-restricted (e.g., Espressif-only) source code into this MIT repository. Always update `NOTICE.md` when adding or attributing third-party code.

## Required Pre-PR Verification

Before marking any PR ready for review, every agent must pass:

```bash
npm run typecheck
npm run test
npm run secret-scan
npm run export:native
```

See [`docs/AGENT_WORKFLOW.md`](./docs/AGENT_WORKFLOW.md) for detailed branching, issue triage, and review checklists.
