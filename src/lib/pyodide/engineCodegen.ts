/**
 * Engine-specific codegen seam.
 *
 * Lets an alternate-engine build inject setup code into the generated Python
 * *after* the imports and *before* the blocks, without touching the shared
 * code generation in pathsimRunner.ts. The default engine (pathsim) needs none,
 * so this is a no-op that a re-engined build swaps out (like the worker-side
 * engineInstall seam).
 *
 * Example (fastsim): emit class-level `port()` wraps for toolbox block classes,
 * because fastsim's `Connection` only accepts fastsim blocks, so a pathsim
 * toolbox block must be ported at the class level before any instance is built.
 */

/** A named block of setup lines emitted after imports, before block creation. */
export interface EngineSetup {
	/** Section header, rendered as a `# <header>` comment (with a banner on export). */
	header: string;
	/** Python source lines for the section body. */
	lines: string[];
}

/**
 * Engine-specific setup code, given the block import groups (import path → class
 * names) collected from the graph. Returns null when the engine needs no setup
 * (the default), in which case no section is emitted.
 */
export function generateEngineSetup(
	_importGroups: Map<string, Set<string>>
): EngineSetup | null {
	return null;
}
