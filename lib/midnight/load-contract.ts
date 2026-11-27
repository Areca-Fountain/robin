'use client';

/**
 * Loads the compiled Robin contract (midnight/managed/robin_private/contract/index.js).
 *
 * This code runs in the BROWSER, so the file has to go through the bundler:
 *  - a plain native import() cannot find a file outside /public from the browser, and
 *  - the compiled file imports @midnight-ntwrk/compact-runtime, a bare package name that
 *    only the bundler can resolve (it also makes sure only ONE copy of the runtime is used).
 *
 * The path is built from a template string on purpose: the bundler then collects whatever
 * exists in midnight/managed/ at build time, instead of failing the whole build when the
 * folder has not been compiled yet. The folder is ignored by Git.
 */
const CONTRACT_NAME = 'robin_private';

const MISSING_HINT =
  'Midnight contract artifact not found (midnight/managed/robin_private). ' +
  'Compile it with the Compact compiler (inside WSL on Windows), then restart the dev server: ' +
  'cd midnight && compact compile robin_private.compact managed/robin_private';

let cached: Promise<any> | null = null;

export function loadRobinContractModule(): Promise<any> {
  if (!cached) {
    cached = (async () => {
      try {
        return await import(`../../midnight/managed/${CONTRACT_NAME}/contract/index.js`);
      } catch (err) {
        cached = null; // allow a retry after the files are added
        console.error('[midnight] could not load the compiled contract:', err);
        const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
        throw new Error(MISSING_HINT + detail);
      }
    })();
  }
  return cached;
}
