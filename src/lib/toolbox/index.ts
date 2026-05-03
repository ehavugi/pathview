/**
 * Runtime toolbox subsystem.
 *
 * Public surface for the rest of the app. Internal modules (installer,
 * extractor, register) wire into this from the next phases.
 */

export type {
	ToolboxConfig,
	ToolboxSource,
	ToolboxStorage,
	BlockSelection,
	EventSelection,
	BlockOverride
} from './types';
export { TOOLBOX_STORAGE_KEY } from './types';

export {
	toolboxes,
	toolboxIds,
	getToolbox,
	upsertToolbox,
	removeToolbox,
	replaceToolboxes
} from './store';

export {
	installPackage,
	loadInlineModule,
	introspectBlocks,
	introspectEvents,
	uninstallModule,
	type IntrospectedBlock,
	type IntrospectedEvent
} from './installer';

export {
	performInstall,
	discoverToolbox,
	registerToolbox,
	uninstallToolbox
} from './register';

export { TOOLBOX_CATALOG, getCatalogEntry, type CatalogEntry } from './catalog';

export { bootstrapToolboxes, type BootstrapStatus } from './bootstrap';
