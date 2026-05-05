/**
 * App-startup hook for runtime toolboxes.
 *
 * Seeds preloaded catalog entries on first launch, then re-installs and
 * registers everything in the persisted store. Toolbox configs from a
 * fresh seed have empty `blocks`/`events` arrays — bootstrap fills them
 * with the discovered defaults and persists, so the in-store state is
 * always concrete after first install.
 *
 * Failures are logged, never thrown — a broken toolbox shouldn't take
 * the whole app down.
 */

import { get } from 'svelte/store';
import { toolboxes, upsertToolbox, seedPreloadedToolboxes } from './store';
import { performInstall, discoverToolbox, registerToolbox } from './register';
import { getCatalogEntry } from './catalog';
import { primePathsimVersion } from './pathsimVersion';
import type { ToolboxConfig } from './types';

let bootstrapped = false;

export async function bootstrapToolboxes(): Promise<void> {
	if (bootstrapped) return;
	bootstrapped = true;

	// Cache pathsim's version once so createGraphFile (which is sync) can
	// stamp it into saved files without needing an async hop.
	await primePathsimVersion();

	seedPreloadedToolboxes();

	const list = get(toolboxes);
	if (list.length === 0) return;

	for (const config of list) {
		try {
			const installResult = await performInstall(config.source, config.importPath || undefined);
			const discovered = await discoverToolbox({
				importPath: installResult.importPath,
				eventsImportPath: config.eventsImportPath
			});

			// Reconcile selections against current discovery: preserves the
			// user's enabled/override choices, adds new classes the upstream
			// package introduced (enabled by default), and drops entries
			// whose classes no longer exist.
			const reconciled: ToolboxConfig = {
				...config,
				importPath: installResult.importPath,
				installedVersion: installResult.installedVersion,
				blocks: discovered.blocks.map(
					(b) =>
						config.blocks.find((s) => s.className === b.className) ?? {
							className: b.className,
							enabled: true
						}
				),
				events: discovered.events.map(
					(e) =>
						config.events.find((s) => s.className === e.className) ?? {
							className: e.className,
							enabled: true
						}
				)
			};

			const catalog = getCatalogEntry(config.id);
			registerToolbox(reconciled, {
				blocks: discovered.blocks,
				events: discovered.events,
				defaultCategory: catalog?.defaultCategory,
				categoryByClass: catalog?.categoryByClass
			});

			upsertToolbox(reconciled);
		} catch (e) {
			console.error(`[toolbox] bootstrap failed for "${config.id}":`, e);
		}
	}
}
