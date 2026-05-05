/**
 * Schema type definitions for file I/O
 */

import type { NodeInstance, Connection, Annotation } from './nodes';
import type { EventInstance } from './events';
import type { SimulationSettings } from './simulation';
import type { ToolboxSource } from '$lib/toolbox/types';

/** File metadata */
export interface FileMetadata {
	created: string;
	modified: string;
	name: string;
	description?: string;
	/** Pathsim version installed when the file was saved. Used at load
	 *  time to warn the user if their pathsim differs significantly. */
	pathsimVersion?: string | null;
}

/**
 * Minimal install descriptor embedded in saved files so a model can declare
 * which runtime toolboxes its blocks come from. The loader matches these
 * against the current toolbox store and prompts to install any missing ones.
 *
 * Optional for backward compatibility: files saved before this field
 * existed simply have no `requiredToolboxes` and load as before.
 */
export interface ToolboxRequirement {
	id: string;
	displayName: string;
	source: ToolboxSource;
	importPath: string;
	eventsImportPath?: string;
	/** Version actually installed on the machine that saved this file
	 *  (read from `module.__version__` / `importlib.metadata`). The loader
	 *  offers to pin to this version for reproducibility. */
	installedVersion?: string | null;
}

/** Shared graph content structure (used by GraphFile and ModelContent) */
export interface GraphContent {
	graph: {
		nodes: NodeInstance[];
		connections: Connection[];
		annotations?: Annotation[];
	};
	events?: EventInstance[];
	codeContext: {
		code: string;
	};
	simulationSettings: SimulationSettings;
	/** Optional list of runtime toolboxes this file needs to render correctly. */
	requiredToolboxes?: ToolboxRequirement[];
}

/** Graph file format */
export interface GraphFile extends GraphContent {
	version: string;
	metadata: FileMetadata;
}

/** Current graph file version */
export const GRAPH_FILE_VERSION = '1.0.0';
