/**
 * Curated toolbox catalog.
 *
 * Hardcoded list of toolboxes that show up in the wizard's "Catalog" tab.
 * Users can still install anything else via PyPI / URL / file upload.
 */

import type { ToolboxSource } from './types';

export interface CatalogEntry {
	/** Stable id used as the registry source key. */
	id: string;
	/** Display name in the catalog and Block Library section header. */
	displayName: string;
	/** One-line description shown on the catalog card. */
	description: string;
	/** Tags shown as small pills on the card. */
	tags: string[];
	/** Pre-defined install source. */
	source: ToolboxSource;
	/** Python module path used for block introspection. */
	importPath: string;
	/** Optional events submodule. */
	eventsImportPath?: string;
	/**
	 * Default category to assign to specific block classes. Falls back to
	 * the toolbox's display name for any class not listed here.
	 */
	categoryByClass?: Record<string, string>;
}

export const TOOLBOX_CATALOG: CatalogEntry[] = [
	{
		id: 'pathsim-chem',
		displayName: 'pathsim-chem',
		description: 'Chemical engineering blocks: reactors, separators, mixers and more.',
		tags: ['Chemical', 'Process'],
		source: { type: 'pypi', pkg: 'pathsim-chem' },
		importPath: 'pathsim_chem',
		categoryByClass: {
			Process: 'Chemical',
			ResidenceTime: 'Chemical',
			Splitter: 'Chemical',
			Bubbler4: 'Chemical',
			GLC: 'Chemical',
			CSTR: 'Chemical',
			PFR: 'Chemical',
			HeatExchanger: 'Chemical',
			FlashDrum: 'Chemical',
			Mixer: 'Chemical',
			Valve: 'Chemical',
			Heater: 'Chemical',
			PointKinetics: 'Chemical'
		}
	}
];

export function getCatalogEntry(id: string): CatalogEntry | undefined {
	return TOOLBOX_CATALOG.find((e) => e.id === id);
}
