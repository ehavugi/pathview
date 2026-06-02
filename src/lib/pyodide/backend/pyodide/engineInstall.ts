/**
 * Engine install seam (worker side).
 *
 * Installs the simulation engine into the Pyodide runtime. The default is the
 * configured PyPI packages (pathsim). This is a dedicated, stable seam so an
 * alternate-engine build can swap *only* this module (e.g. to install a wasm
 * wheel, optionally gated behind `ctx.token`) without touching the worker's
 * lifecycle code. `PYODIDE_PRELOAD` is loaded by the caller before this runs.
 */

import { PYTHON_PACKAGES } from '$lib/constants/dependencies';
import { PROGRESS_MESSAGES } from '$lib/constants/messages';
import type { PyodideInterface } from 'https://cdn.jsdelivr.net/pyodide/v0.29.4/full/pyodide.mjs';

export interface EngineInstallContext {
	/** Emit a progress message to the UI. */
	send: (msg: { type: 'progress'; value: string }) => void;
	/** Auth token for a gated engine download (unused by the pathsim default). */
	token?: string | null;
}

export async function installEngine(
	pyodide: PyodideInterface,
	ctx: EngineInstallContext
): Promise<void> {
	for (const pkg of PYTHON_PACKAGES) {
		const progressKey = `INSTALLING_${pkg.import.toUpperCase()}` as keyof typeof PROGRESS_MESSAGES;
		ctx.send({
			type: 'progress',
			value: PROGRESS_MESSAGES[progressKey] ?? `Installing ${pkg.import}...`
		});

		try {
			const preFlag = pkg.pre ? ', pre=True' : '';
			await pyodide.runPythonAsync(`
import micropip
await micropip.install('${pkg.pip}'${preFlag})
			`);

			// Verify installation
			await pyodide.runPythonAsync(`
import ${pkg.import}
print(f"${pkg.import} {${pkg.import}.__version__} loaded successfully")
			`);
		} catch (error) {
			if (pkg.required) {
				throw new Error(`Failed to install required package ${pkg.pip}: ${error}`);
			}
			console.warn(`Optional package ${pkg.pip} failed to install:`, error);
		}
	}
}
