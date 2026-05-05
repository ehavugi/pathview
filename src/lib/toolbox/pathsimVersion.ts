/**
 * Cached pathsim version. Read once via `getModuleVersion('pathsim')` after
 * bootstrap, then exposed synchronously so `createGraphFile` (which can't
 * be async because it's called from autoSave) can stamp the version into
 * saved files.
 */

import { getModuleVersion } from './installer';

let cached: string | null = null;
let primed = false;

/** Read pathsim's version from Python and cache it. Call once after the
 *  Python runtime is up (bootstrap or first save). Idempotent. */
export async function primePathsimVersion(): Promise<void> {
	if (primed) return;
	try {
		cached = await getModuleVersion('pathsim');
	} catch {
		cached = null;
	}
	primed = true;
}

/** Synchronous accessor. Returns null until `primePathsimVersion` has run. */
export function getCachedPathsimVersion(): string | null {
	return cached;
}
