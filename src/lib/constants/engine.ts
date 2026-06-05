/**
 * Simulation engine selection.
 *
 * pathview generates Python that imports from the `pathsim` package tree. The
 * engine is parameterised so a drop-in replacement with the same module layout
 * (`<engine>`, `<engine>.blocks`, `<engine>.solvers`, `<engine>.events`) and
 * class names can be selected at build time via the `VITE_ENGINE` env var.
 *
 * Defaults to `pathsim`, so an unconfigured build behaves exactly as before:
 * `ENGINE_MODULE` is `pathsim` and `enginePath()` is the identity.
 * (Uses the VITE_ prefix to match the repo's existing import.meta.env usage.)
 */

/** Active engine module name, fixed at build time. Defaults to pathsim. */
export const ENGINE: string = import.meta.env.VITE_ENGINE || 'pathsim';

/** Root import module for the active engine (alias of {@link ENGINE}). */
export const ENGINE_MODULE: string = ENGINE;

/**
 * Map a `pathsim` package import path to the active engine's package tree.
 *
 * Core paths (`pathsim`, `pathsim.blocks`, `pathsim.solvers`, ...) are rewritten
 * to the engine module; everything else (e.g. toolbox import paths like
 * `pathsim_chem.blocks`) is left untouched. In the default pathsim build this is
 * the identity function.
 */
export function enginePath(path: string): string {
	if (ENGINE === 'pathsim') return path;
	if (path === 'pathsim' || path.startsWith('pathsim.')) {
		return ENGINE_MODULE + path.slice('pathsim'.length);
	}
	return path;
}
