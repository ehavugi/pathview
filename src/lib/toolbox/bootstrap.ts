/**
 * App-startup hook that re-installs and registers all persisted toolboxes.
 *
 * Called once after Pyodide is ready. Failures are logged, never thrown —
 * a broken toolbox shouldn't take the whole app down.
 */

import { get } from 'svelte/store';
import { toolboxes, getToolbox } from './store';
import { performInstall, discoverToolbox, registerToolbox } from './register';
import { getCatalogEntry } from './catalog';
import type { ToolboxConfig } from './types';

let bootstrapped = false;

export interface BootstrapStatus {
	id: string;
	displayName: string;
	ok: boolean;
	error?: string;
}

/**
 * Re-install + register every persisted toolbox. Safe to call multiple
 * times (no-op after the first run).
 */
export async function bootstrapToolboxes(): Promise<BootstrapStatus[]> {
	if (bootstrapped) return [];
	bootstrapped = true;

	const list = get(toolboxes);
	if (list.length === 0) return [];

	const results: BootstrapStatus[] = [];
	for (const config of list) {
		try {
			const installResult = await performInstall(config.source, config.importPath || undefined);
			// Some sources (inline) generate the importPath; persist if it changed.
			const updatedConfig: ToolboxConfig = {
				...config,
				importPath: installResult.importPath
			};

			const discovered = await discoverToolbox({
				importPath: updatedConfig.importPath,
				eventsImportPath: updatedConfig.eventsImportPath
			});

			const catalog = getCatalogEntry(config.id);
			await registerToolbox(updatedConfig, {
				blocks: discovered.blocks,
				events: discovered.events,
				categoryByClass: catalog?.categoryByClass
			});

			results.push({ id: config.id, displayName: config.displayName, ok: true });
		} catch (e) {
			const error = e instanceof Error ? e.message : String(e);
			// eslint-disable-next-line no-console
			console.error(`[toolbox] bootstrap failed for "${config.id}":`, error);
			results.push({ id: config.id, displayName: config.displayName, ok: false, error });
		}
	}
	return results;
}

/** Reset the once-flag (for tests / dev tooling). */
export function _resetBootstrapForTesting(): void {
	bootstrapped = false;
}

export { getToolbox };
