# Codex Header Plugin Frontend Decoupling

## Scope
- Branch: `feat/codex-header-plugin`; frontend only.
- Removed the standalone Header Rules navigation item. The old URL redirects to `/plugins`.
- Reused `AutoTurnStateControls` and `RequestHeaderRulesPage` in the running
  `codex-headers` plugin's gear dialog.
- Disabled/unloaded Codex plugin settings display readable manual rules without maintenance
  controls. Automatic settings are unavailable; raw stored `enabled` values are not displayed.
- Removed `/usage/turn-state-auto-rules` fallback. Reads and writes use the existing
  `/plugins/codex-headers/turn-state` endpoint after checking live plugin status.
- Generated rules still use `/plugins/codex-headers/rules`. Manual rules retain
  `/request-header-rules`, honor its `read_only` flag, and check live plugin status before mutation.
  Manual reads remain available while the plugin is disabled or unloaded.
- Capture, Turn State parsing, length display, and length export are unchanged.

## Verification (2026-09-22)
- `npm run build`: passed (TypeScript and Vite, 749 modules).
  Existing version detection in `vite.config.ts` uses Unix `/dev/null` redirection,
  producing two nonfatal Windows path warnings. No build configuration was changed.
- Focused ESLint on all eight changed TS/TSX files: passed.
- In-memory Node regression checks using TypeScript transpilation and a mocked
  API client: passed for active-plugin endpoint routing, default normalization,
  generated/manual rule merge, and manual rule mutation.
- Missing, disabled, and unregistered plugin cases reject automatic settings reads/writes
  and rule mutations. Read-only manual rule lists require only `GET /request-header-rules`.
- Plugin-list and Turn State endpoint failures do not fall back to native writes.
- Source-wiring assertions confirm gear-only maintenance, read-only manual rules,
  removal of the standalone navigation, and retained capture/length observation.
- Follow-up contract checks: explicit client read-only and missing backend `read_only`
  fail closed; active lists still merge plugin-generated rules; disabled lists exclude
  legacy generated rules and do not request automatic settings or plugin rules.
- Follow-up build and focused ESLint on the three changed TS/TSX files passed.
- Codebase index refreshed after implementation.

## Browser Interaction Verification
- Reused the Edge/Playwright component harness from `.codex/verify-plugin-cards.mjs`
  in `.codex/verify-codex-settings.mjs`; management responses are mocked.
- Actual `PluginsPage` gear: enabled settings load and save through the plugin endpoint;
  the manual Add Rule dialog opens and closes; disabling the installed plugin switches
  the gear to readable manual rules with no automatic settings or maintenance actions.
- Nonexpired read-only rules display Disabled, including permanent rules with no
  `active` property. Expired rules remain Expired. Unloaded-plugin gear also passes.
- Actual full `UsagePage`: Capture upstream remains, automatic Turn State maintenance
  is absent, and the Turn State length column displays the mocked value `292`.
- Desktop (1440px) and mobile (390px) screenshots saved under `.codex/codex-*.png`;
  no document horizontal overflow or browser page errors. Enabled desktop and disabled
  mobile screenshots were visually inspected.
- `node .codex/verify-codex-settings.mjs`: passed. The script closes its Edge browser
  and temporary Vite server in `finally`, then verifies the port no longer responds.
- Build and focused ESLint passed after the read-only status correction.

## Limits
- Browser interactions use mocked management APIs, not a live backend.
- Frontend status checks cannot make the subsequent request atomic with plugin
  disablement; backend authorization and plugin endpoint gating remain authoritative.
- No backend files were modified or synchronized; no test server was left running.
