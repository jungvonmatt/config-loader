# Security assessment — 2026-10-23

This assessment covers the configuration library, its dependencies, Git history, and GitHub Actions workflows.
The starting revision was `fa0d599`; results include the maintenance changes in this working tree.

## Results

| Check                                          | Before                                  | After               |
| ---------------------------------------------- | --------------------------------------- | ------------------- |
| Full dependency audit                          | 3 critical, 19 high, 15 moderate, 5 low | 0 advisories        |
| Runtime dependency audit                       | 1 high                                  | 0 advisories        |
| Gitleaks 8.30.1, available Git history         | 65 commits scanned                      | No secrets detected |
| Gitleaks 8.30.1, nonignored working tree       | Scanned with redacted output            | No secrets detected |
| Tests                                          | 118 passing                             | 120 passing         |
| Lint, formatting, type checking, package build | Existing test baseline passed           | Passed              |

Audits used the npm advisory database through `pnpm audit --json` and `pnpm audit --prod --json`.
No dependency advisory is deferred. These results describe the scan date; they do not guarantee future packages are safe.

## Confirmed findings and remediation

### Medium: global rc opt-out was ignored

`loadConfig` forced `globalRc: true` in its initial c12 call, even when callers supplied `globalRc: false`.
A user rc file could therefore inject configuration into a caller that had explicitly disabled global configuration.
Exploitation requires control of a user or workspace rc source; this is not an unauthenticated remote vulnerability.

The loader now uses `options.globalRc ?? true`, preserving the default and respecting an explicit opt-out.
A regression test reproduced an injected value with the old code. Tests now verify both disabled and enabled user rc loading.
This finding maps to OWASP A02:2025 (configuration) and A06:2025 (design).

### High: vulnerable runtime source-map parser

The original runtime graph included `c12 → magicast → source-map-js@1.2.1`.
[CVE-2026-93749 / GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
allows crafted indexed source maps to block the event loop.
Reachability depends on processing attacker-controlled maps through the configuration tooling.
The refreshed graph uses the patched parser, and the runtime audit reports zero advisories.

### Critical and high: vulnerable development tooling

The original graph included Vite/Vitest browser and editor endpoints, Tinypool worker gadgets, and vulnerable build parsers.
Browser-server findings require exposed development endpoints; this repository runs tests in Node mode.
Worker and parser findings require their documented malicious input or prototype-pollution preconditions.
These packages are development dependencies, but build and CI execution still make them relevant.

Vite+ is pinned to `1.4.0`; Vitest and its coverage provider are aligned at `5.0.5`.
The obsolete `@voidzero-dev/vite-plus-test` alias and unused `eslint-config-unjs` dependency tree were removed.
Transitive dependencies were refreshed within their declared ranges. The full audit reports zero advisories.
The appendix identifies every original advisory.

### CI supply-chain controls

Workflows now pin checkout, setup-vp, and SonarQube actions to verified release commits.
The existing autofix action was already pinned.
CI uses read-only repository permissions, disables persisted checkout credentials, and installs with a frozen lockfile and scripts disabled.
`onlyBuiltDependencies: []` records the dependency-script policy. No dependency build scripts are approved.
CI runs `pnpm run audit` and fails for any reported severity.
These controls map to OWASP A03:2025 and A08:2025.

## Architecture and trust boundaries

The assets are the host process, filesystem access, environment secrets, returned configuration, and CI credentials.
Inputs cross boundaries from config files and inherited rc files, environment variables, interactive responses, package downloads, and workflow actions.

| Threat                 | Relevant boundary                     | Assessment                                                                                                         |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Spoofing               | Paths and config sources              | The caller must choose trusted paths, names, and environment names. There is no remote identity layer.             |
| Tampering              | Config discovery and merging          | The global rc opt-out is repaired. Config files and overrides can intentionally change application behavior.       |
| Repudiation            | Library calls                         | Applications own audit events. The library does not provide an application audit trail.                            |
| Information disclosure | Environment, prompts, returned layers | Config and layers can contain secrets. Callers must redact logs and use password prompts for credentials.          |
| Denial of service      | Parsing and recursive configuration   | Known dependency issues are patched. File sizes, nesting, cycles, and execution time are not sandboxed or bounded. |
| Privilege escalation   | Executable config and dependency code | Config code runs with the caller's permissions. Install scripts are blocked; runtime config remains trusted code.  |

JavaScript/TypeScript configs, functions, and c12 extensions intentionally execute code with host permissions.
JSON/YAML configuration is also trusted: its `extends` values can load executable or remote configuration.
Dotenvx supports [command substitution](https://dotenvx.com/features/command-substitution.html), so `.env` files are executable input too.
Use this library only with trusted configuration directories and sources. Disable dotenv loading when it is unnecessary.
`globalRc: false` limits global rc loading; it does not sandbox the project config or its extensions.

Environment values are parsed and merged without a runtime schema. `required` verifies key presence, not type or business validity.
Consumers must validate the final configuration before using it for authorization, commands, URLs, or filesystem operations.
The loader mutates `process.env` when dotenv loading is enabled; avoid using it to isolate mutually untrusted tenants in one process.

## OWASP coverage

The review uses the [OWASP Top 10:2025](https://top10.owasp.org/2025/) and
[OWASP API Security Top 10:2023](https://api-security.owasp.org/editions/2023/en/0x11-t10/).
This package has no HTTP server, routes, database, authentication, sessions, or business endpoints.
Web and API categories are therefore applicability checks, not a certification of a consuming application.

| OWASP Top 10:2025  | Result                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| A01 Access control | Caller controls trusted config paths. No application authorization endpoints.                    |
| A02 Configuration  | Fixed the global rc opt-out; tightened CI permissions and installation.                          |
| A03 Supply chain   | Updated dependencies, removed obsolete tooling, pinned actions, added an audit gate.             |
| A04 Cryptography   | No custom cryptography. Dotenvx key custody remains the consumer's responsibility.               |
| A05 Injection      | Executable config and dotenv commands require trusted input. No SQL or HTML sinks in source.     |
| A06 Design         | Documented execution, environment mutation, schema validation, and resource limits.              |
| A07 Authentication | No authentication or session implementation.                                                     |
| A08 Integrity      | Frozen lockfile, tarball integrity entries, immutable action revisions, blocked install scripts. |
| A09 Logging        | No secret-value logging found in source. Returned config/layers need consumer redaction.         |
| A10 Exceptions     | Existing invalid-file and missing-field tests pass. Callers must handle errors and redact paths. |

| OWASP API Security Top 10:2023 | Result                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| API1 Object authorization      | No resource endpoints; not applicable to this package.                                           |
| API2 Authentication            | No authentication endpoints; not applicable.                                                     |
| API3 Property authorization    | No API response or mass-assignment layer; validate config before downstream use.                 |
| API4 Resource consumption      | No public API; do not parse untrusted config or expose config execution per request.             |
| API5 Function authorization    | No protected functions exposed over HTTP; not applicable.                                        |
| API6 Business flows            | No business endpoints; not applicable.                                                           |
| API7 SSRF                      | c12 can retrieve remote extensions. Keep configuration trusted; no general URL-safety guarantee. |
| API8 Configuration             | Fixed global rc behavior and hardened CI. Consumer HTTP settings remain outside scope.           |
| API9 Inventory                 | No deployed API versions or hosts in this repository; not applicable.                            |
| API10 External APIs            | Remote config and package registries are supply-chain trust boundaries.                          |

## Verification and limitations

Verification used `pnpm test`, `pnpm build`, full and runtime-only audits, and Gitleaks with `--redact`.
A fresh temporary checkout copy also passed a frozen install with scripts disabled, all 120 tests, and the package build.
The built ESM module passed a configuration-loading smoke check.
The official Gitleaks release archive matched its published SHA-256 checksum.
Secret scanning covered available Git refs and nonignored working files, not ignored local secrets or inaccessible remote history.
No live infrastructure, organization settings, deployed consumer application, or CI-hosted Sonar scan was assessed.
Dependency provenance and registry signatures were not independently verified. Manual source review is not exhaustive static analysis or penetration testing.

TypeScript remains at `6.0.3`: TypeScript 7 lacks the compiler API required by the declaration build.
Dotenvx was updated to `1.75.1` within its existing major; version 2 changes key handling and requires separate compatibility review.
These are compatibility decisions, not deferred known vulnerabilities.

Repository diagnostics found one dominant maintainer (61 of 62 non-merge commits) and seven recent commits from that maintainer.
Recent churn is concentrated in CI and dependency files. Historical bug fixes concentrate in `src/index.ts` and config-loading tests.
There were no revert/hotfix/emergency/rollback subjects in the last year. Monthly activity occurs in batches rather than continuously.
Fallow 3.34.1 found no circular dependencies or duplicated production code, and identified the removed ESLint dependency.
`loadConfig` has cyclomatic complexity 51 and is the main source-review hotspot; `src/env.ts` is the second boundary to inspect.
Architecture rules were not configured for Fallow, so its zero boundary-violation count is not evidence of enforced architecture.

## Original dependency advisories

All 42 advisories below are absent from the updated lockfile's audit result.
Severity is the registry rating; applicability depends on the execution paths described above.

| Severity | Original package/version           | Advisory                                                                 |
| -------- | ---------------------------------- | ------------------------------------------------------------------------ |
| low      | `vite` 6.3.5                       | [GHSA-g4jq-h2w9-997c](https://github.com/advisories/GHSA-g4jq-h2w9-997c) |
| low      | `vite` 6.3.5                       | [GHSA-jqfw-vq24-v9c3](https://github.com/advisories/GHSA-jqfw-vq24-v9c3) |
| moderate | `vite` 6.3.5                       | [GHSA-93m4-6634-74q7](https://github.com/advisories/GHSA-93m4-6634-74q7) |
| moderate | `vite` 6.3.5                       | [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) |
| high     | `vite` 6.3.5                       | [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583) |
| moderate | `vite-plus` 0.1.21                 | [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) |
| moderate | `vite` 6.3.5                       | [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) |
| high     | `ws` 8.20.1                        | [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) |
| high     | `vite-plus` 0.1.21                 | [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) |
| high     | `vite` 6.3.5                       | [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) |
| high     | `brace-expansion` 5.0.6            | [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) |
| high     | `brace-expansion` 5.0.6            | [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) |
| moderate | `postcss` 8.5.14                   | [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) |
| high     | `brace-expansion` 5.0.6            | [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) |
| high     | `nanoid` 3.3.12                    | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) |
| high     | `nanoid` 3.3.12                    | [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) |
| high     | `postcss` 8.5.14                   | [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) |
| high     | `svgo` 4.0.1                       | [GHSA-2p49-hgcm-8545](https://github.com/advisories/GHSA-2p49-hgcm-8545) |
| critical | `vite-plus` 0.1.21                 | [GHSA-g8mr-85jm-7xhm](https://github.com/advisories/GHSA-g8mr-85jm-7xhm) |
| low      | `postcss-selector-parser` 7.1.1    | [GHSA-w9m9-85wc-3x92](https://github.com/advisories/GHSA-w9m9-85wc-3x92) |
| high     | `browserslist` 4.28.2              | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) |
| high     | `browserslist` 4.28.2              | [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) |
| moderate | `baseline-browser-mapping` 2.10.30 | [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) |
| high     | `svgo` 4.0.1                       | [GHSA-w27v-7q3p-w38r](https://github.com/advisories/GHSA-w27v-7q3p-w38r) |
| moderate | `svgo` 4.0.1                       | [GHSA-4vpr-x523-8j87](https://github.com/advisories/GHSA-4vpr-x523-8j87) |
| moderate | `brace-expansion` 5.0.6            | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) |
| high     | `brace-expansion` 5.0.6            | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) |
| high     | `brace-expansion` 5.0.6            | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) |
| high     | `source-map-js` 1.2.1              | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| moderate | `postcss-selector-parser` 7.1.1    | [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) |
| critical | `tinypool` 2.1.0                   | [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) |
| critical | `tinypool` 2.1.0                   | [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) |
| moderate | `vite-plus` 0.1.21                 | [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) |
| moderate | `vite` 6.3.5                       | [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) |
| moderate | `vite-plus` 0.1.21                 | [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) |
| moderate | `vite` 6.3.5                       | [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) |
| high     | `vite-plus` 0.1.21                 | [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) |
| high     | `vite` 6.3.5                       | [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) |
| low      | `vite-plus` 0.1.21                 | [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) |
| low      | `vite` 6.3.5                       | [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) |
| moderate | `vite-plus` 0.1.21                 | [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) |
| moderate | `vite` 6.3.5                       | [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) |
