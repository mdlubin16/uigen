---
description: Audit and update vulnerable dependencies (respecting the pinned dependency set)
argument-hint: "[optional: package name to focus on]"
allowed-tools: Read, Grep, Glob, Bash(npm audit:*), Bash(npm ls:*), Bash(npm view:*), Bash(npm outdated:*), Bash(npm install:*), Bash(npm test:*), Bash(npx vitest:*)
---

Audit this project's dependencies for known security vulnerabilities and update them safely.

Focus: **$ARGUMENTS** (if empty, audit all dependencies).

## Hard constraint (from CLAUDE.md)
**Never run `npm audit fix`.** Dependencies are intentionally pinned to a mutually-compatible set, and `audit fix` will break the app. All updates must be deliberate, minimal, and verified by the test suite.

## Steps

1. **Detect** — run `npm audit` (read-only) to list vulnerabilities. Capture each one's package, severity, vulnerable version range, and the patched version. Also note whether it's a direct dependency or transitive (`npm ls <pkg>`).

2. **Triage** — group findings by severity (Critical / High / Moderate / Low). For each, determine the minimal version bump that resolves it and whether the fix is in a patch, minor, or major release (`npm view <pkg> versions`).

3. **Assess risk** — before proposing any change, flag anything that could break the pinned set:
   - major-version bumps,
   - peer-dependency conflicts,
   - transitive deps that can't be bumped without changing a direct dependency.
   Do **not** apply these automatically — surface them for me to decide.

4. **Apply safe updates** — for low-risk fixes (patch/compatible-minor bumps of direct deps), update the specific version in `package.json` and run a targeted `npm install <pkg>@<version>`. One package at a time; never a blanket upgrade.

5. **Verify** — after each batch of updates, run `npm test`. If anything fails, revert that update and report it as requiring manual attention.

## Output
Report a table of: package · severity · current → proposed version · risk (safe / needs review) · action taken. End with which vulnerabilities were resolved, which were left for manual review and why, and the final `npm test` result.
