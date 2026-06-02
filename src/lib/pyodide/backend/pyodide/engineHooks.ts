/**
 * Engine hooks (main thread).
 *
 * `enginePreInit` runs right before the Pyodide worker is initialized. The
 * default is a no-op that returns no token. A dedicated, stable seam so an
 * alternate-engine build can swap *only* this module to, for example, obtain an
 * auth token (and open a sign-in UI) before the engine install. The returned
 * token is forwarded in the worker's `init` message and handed to the engine
 * install seam ({@link ./engineInstall}).
 */
export async function enginePreInit(): Promise<string | null> {
	return null;
}
