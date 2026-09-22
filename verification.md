# Codex Header Plugin Frontend Decoupling

## Scope
- Branch: `feat/codex-header-plugin`; frontend only.
- Removed the standalone Header Rules navigation item. The old URL redirects to `/plugins`.
- Reused `AutoTurnStateControls` and `RequestHeaderRulesPage` in the running
  `codex-headers` plugin's gear dialog.
- Disabled/unloaded plugin settings display read-only configuration without maintenance controls.
- Removed `/usage/turn-state-auto-rules` fallback. Reads and writes use the existing
  `/plugins/codex-headers/turn-state` endpoint after checking live plugin status.
- Generated rules still use `/plugins/codex-headers/rules`. Manual rules retain
  `/request-header-rules`, with a live plugin check before listing or mutation.
- Capture, Turn State parsing, length display, and length export are unchanged.

## Verification (2026-09-22)
- `npm run build`: passed (TypeScript and Vite, 749 modules).
  Existing version detection in `vite.config.ts` uses Unix `/dev/null` redirection,
  producing two nonfatal Windows path warnings. No build configuration was changed.
- Focused ESLint on all eight changed TS/TSX files: passed.
- In-memory Node regression checks using TypeScript transpilation and a mocked
  API client: passed for active-plugin endpoint routing, default normalization,
  generated/manual rule merge, and manual rule mutation.
- Missing, disabled, and unregistered plugin cases reject settings reads/writes
  and rule reads/mutations after only the plugin-list request.
- Plugin-list and Turn State endpoint failures do not fall back to native writes.
- Source-wiring assertions confirm gear-only maintenance, read-only configuration,
  removal of the standalone navigation, and retained capture/length observation.
- Codebase index refreshed; the shared plugin guard has three callers.

## Limits
- No browser interaction or live-backend integration test was performed.
- Frontend status checks cannot make the subsequent request atomic with plugin
  disablement; backend authorization and plugin endpoint gating remain authoritative.
- No backend files were modified or synchronized; no persistent server was started.
