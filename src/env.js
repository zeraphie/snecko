// env.js — Build / runtime environment flags.
//
// Single source of truth for "are we in a development build or a
// production one". Consumers import `IS_DEV_BUILD` from here and gate
// dev-only branches (debug keybindings, console.log diagnostics, etc.)
// behind it.
//
// `__DEV_BUILD__` is a build-time identifier — `package.json`'s
// `upload:build` script passes `bun build --define:__DEV_BUILD__=false`,
// which textually replaces every reference with `false`. The minifier
// then dead-code-eliminates the guarded branches.
//
// Unbundled paths (`npm run serve`, vitest, `node` terminal entry)
// leave the identifier undeclared; the `typeof` guard catches that
// without throwing a ReferenceError, and the flag defaults to `true`.
//
// To add a new dev-only branch anywhere in the codebase:
//   import { IS_DEV_BUILD } from "<...>/env.js";
//   if (IS_DEV_BUILD) { ... }
//
// Don't add other flavours of dev/prod detection (hostname checks,
// process.env reads, etc.) — they introduce edge cases. Always read
// from here.

export const IS_DEV_BUILD = typeof __DEV_BUILD__ === "undefined" || __DEV_BUILD__;
