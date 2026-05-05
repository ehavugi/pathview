/**
 * Guided tours through PathView. Three tours, started from the welcome banner:
 *   - Start tour:    Editor navigation (panels, files, view, help)
 *   - Modeling tour: Building & customising blocks (selection, properties,
 *                    pinning, naming with math, colors, icons, annotations)
 *   - Simulation tour: Running and inspecting (settings, run, code, events,
 *                      plots, console, export)
 *
 * Each tour can load a paired example model so steps can refer to concrete
 * blocks, panels and traces. Panel/modal steps come in pairs: the toggle is
 * highlighted first, then on Next the panel opens and its content is shown.
 */

import { driver, type DriveStep, type Config, type Driver, type DriverHook } from 'driver.js';
import 'driver.js/dist/driver.css';
import { base } from '$app/paths';
import { importFromUrl } from '$lib/schema/fileOps';
import { confirmationStore } from '$lib/stores/confirmation';
import { triggerFitView } from '$lib/stores/viewActions';
import { graphStore } from '$lib/stores/graph';
import { openNodeDialog, closeNodeDialog } from '$lib/stores/nodeDialog';
import { iconModeStore } from '$lib/stores/iconMode';
import { portLabelsStore } from '$lib/stores/portLabels';

let activeTour: Driver | null = null;
const tourOpenedPanels = new Set<string>();
let savedIconMode: boolean | null = null;
let savedPortLabels: boolean | null = null;

function ensurePanelOpen(label: string): void {
	const btn = document.querySelector<HTMLButtonElement>(
		`.toggle-btn[aria-label="${label}"]`
	);
	if (btn && !btn.classList.contains('active')) {
		btn.click();
		tourOpenedPanels.add(label);
	}
}

function closePanelIfTourOpened(label: string): void {
	if (!tourOpenedPanels.has(label)) return;
	const btn = document.querySelector<HTMLButtonElement>(
		`.toggle-btn[aria-label="${label}"]`
	);
	if (btn && btn.classList.contains('active')) btn.click();
	tourOpenedPanels.delete(label);
}

function closeAllTourOpenedPanels(): void {
	for (const label of [...tourOpenedPanels]) closePanelIfTourOpened(label);
}

/** Close every artifact a tour might have opened: panels, properties dialog,
 *  any open `.dialog` modal, plus restore global toggles to their pre-tour
 *  state so the tour doesn't leave the model with icon mode / port labels on. */
function cleanupTourArtifacts(): void {
	closeAllTourOpenedPanels();
	closeNodeDialog();
	document
		.querySelectorAll<HTMLButtonElement>(
			'.dialog [aria-label="Close"], .properties-dialog [aria-label="Close"]'
		)
		.forEach((b) => b.click());
	if (savedIconMode !== null) {
		iconModeStore.set(savedIconMode);
		savedIconMode = null;
	}
	if (savedPortLabels !== null) {
		portLabelsStore.set(savedPortLabels);
		savedPortLabels = null;
	}
}

/** Open a panel from a toggle-button step and advance once the panel
 *  finished its open animation. Used as `onNextClick`. */
function openPanelAndAdvance(label: string): DriverHook {
	return (_el, _step, opts) => {
		ensurePanelOpen(label);
		setTimeout(() => opts.driver.moveNext(), 280);
	};
}

/** Click a button (by selector) to open a modal, then advance. */
function clickAndAdvance(selector: string, delay = 220): DriverHook {
	return (_el, _step, opts) => {
		document.querySelector<HTMLButtonElement>(selector)?.click();
		setTimeout(() => opts.driver.moveNext(), delay);
	};
}

/** Close any open dialog by clicking its [aria-label="Close"] button. */
function closeDialogAndAdvance(): DriverHook {
	return (_el, _step, opts) => {
		document
			.querySelectorAll<HTMLButtonElement>('.dialog [aria-label="Close"], .properties-dialog [aria-label="Close"]')
			.forEach((b) => b.click());
		setTimeout(() => opts.driver.moveNext(), 200);
	};
}

/** Open the first block's properties dialog. */
function openFirstBlockProperties(): DriverHook {
	return (_el, _step, opts) => {
		const nodes = graphStore.getAllNodes();
		if (nodes.length > 0) openNodeDialog(nodes[0].id);
		setTimeout(() => opts.driver.moveNext(), 220);
	};
}

/* --- Live demo helpers used in the Modeling tour ---------------------- */

function getBlockId(index = 0): string | undefined {
	return graphStore.getAllNodes()[index]?.id;
}

function blockElement(index = 0): Element {
	const id = getBlockId(index);
	const el = id
		? document.querySelector<HTMLElement>(`.svelte-flow__node[data-id="${id}"]`)
		: null;
	return el ?? document.querySelector('.svelte-flow__pane') ?? document.body;
}

function refreshTourSoon(delay = 220): void {
	setTimeout(() => activeTour?.refresh(), delay);
}

/** Trigger Run via the toolbar button. */
function runSimulation(): DriverHook {
	return (_el, _step, opts) => {
		document.querySelector<HTMLButtonElement>('.toolbar-btn[aria-label="Run"]')?.click();
		setTimeout(() => opts.driver.moveNext(), 600);
	};
}

/** Inject a "Continue with next tour" button into the navigation buttons,
 *  between Back and Done. Used as `onPopoverRender` on the last step. */
function addNextTourButton(nextId: TourId, label: string) {
	return (
		popover: { footerButtons: HTMLElement; nextButton: HTMLElement },
		opts: { driver: Driver }
	) => {
		if (popover.footerButtons.querySelector('.tour-next-btn')) return;
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.classList.add('tour-next-btn');
		btn.textContent = label;
		btn.addEventListener('click', () => {
			// `driver.destroy()` skips the onDestroyStarted hook, so clean up
			// modals and panels explicitly before tearing down.
			cleanupTourArtifacts();
			opts.driver.destroy();
			setTimeout(() => startGuidedTour(nextId), 220);
		});
		popover.footerButtons.insertBefore(btn, popover.nextButton);
	};
}

function baseConfig(): Config {
	return {
		showProgress: true,
		allowClose: true,
		stagePadding: 6,
		stageRadius: 8,
		smoothScroll: true,
		nextBtnText: 'Next →',
		prevBtnText: '← Back',
		doneBtnText: 'Got it',
		// driver.js skips its own teardown when `onDestroyStarted` is set, so
		// we must explicitly call destroy() after our cleanup runs.
		onDestroyStarted: () => {
			cleanupTourArtifacts();
			activeTour?.destroy();
		},
		onDestroyed: () => {
			activeTour = null;
			tourOpenedPanels.clear();
		}
	};
}

/* --- Start (Editor Navigation) Tour ----------------------------------- */

const startSteps: DriveStep[] = [
	{
		popover: {
			title: 'Welcome',
			description: `
				<p>A walkthrough of the editor: navigation, panels, view controls, files and help.</p>
				<p>Building and simulating are covered in the <strong>Modeling</strong> and <strong>Simulation</strong> tours.</p>
				<p>Dismiss anytime with <kbd>×</kbd> or <kbd>Esc</kbd>.</p>
			`
		}
	},
	{
		element: '.logo-overlay',
		popover: {
			title: 'Welcome Banner',
			description: `
				<p>Click the logo anytime to reopen the welcome banner — restart any tour, browse examples or jump to docs and GitHub.</p>
			`,
			side: 'bottom',
			align: 'start'
		}
	},
	{
		element: '.toggle-btn[aria-label="Blocks"]',
		popover: {
			title: 'Block Library Toggle',
			description: `
				<p>Opens the Block Library panel on the left.</p>
				<p>Shortcut: <kbd>B</kbd></p>
			`,
			side: 'right',
			align: 'start',
			onNextClick: openPanelAndAdvance('Blocks')
		}
	},
	{
		element: '[data-panel="Blocks"]',
		popover: {
			title: 'Block Library',
			description: `
				<p>Every available block grouped by category:</p>
				<ul>
					<li>Search by name across all categories</li>
					<li>Drag onto canvas, or click to add at center</li>
					<li>Hover any block for a preview tooltip</li>
					<li>Categories collapse for cleaner navigation</li>
				</ul>
			`,
			side: 'right',
			align: 'center'
		}
	},
	{
		element: '[data-panel="Blocks"] [aria-label="Toolboxes"]',
		popover: {
			title: 'Open Toolbox Manager',
			description: `
				<p>This icon at the top of the Block Library opens the Toolbox Manager.</p>
				<p>Click <strong>Next</strong> to open it.</p>
			`,
			side: 'right',
			align: 'start',
			onNextClick: clickAndAdvance('[data-panel="Blocks"] [aria-label="Toolboxes"]', 320)
		}
	},
	{
		element: '.dialog.manager-modal',
		popover: {
			title: 'Toolbox Manager',
			description: `
				<p>Install runtime toolboxes (flight, vehicle, batt, chem, …) on demand:</p>
				<ul>
					<li>New blocks appear in the library immediately after install</li>
					<li>Toolboxes are loaded lazily so the base bundle stays small</li>
					<li>Drop a toolbox URL or pick from the registry</li>
				</ul>
			`,
			side: 'right',
			align: 'center',
			onNextClick: closeDialogAndAdvance()
		},
		onDeselected: () => closePanelIfTourOpened('Blocks')
	},
	{
		element: '.svelte-flow__pane',
		popover: {
			title: 'Canvas',
			description: `
				<p>The interactive working area:</p>
				<ul>
					<li>Drag blocks around — they snap to a grid</li>
					<li>Drag from an output port to an input port to connect</li>
					<li>Double-click a block for properties</li>
					<li>Right-click for the context menu</li>
					<li>Drag empty canvas to pan, scroll to zoom</li>
				</ul>
				<p>Modeling tour covers selection, transform and editing in detail.</p>
			`,
			side: 'right',
			align: 'center'
		}
	},
	{
		element: '.toggle-btn[aria-label="Subsystems"]',
		popover: {
			title: 'Subsystem Tree Toggle',
			description: `
				<p>Opens the Subsystem tree panel. Visible once a Subsystem block exists in the graph.</p>
				<p>Shortcut: <kbd>R</kbd></p>
			`,
			side: 'right',
			align: 'start',
			onNextClick: openPanelAndAdvance('Subsystems')
		}
	},
	{
		element: '[data-panel="Subsystems"]',
		onDeselected: () => closePanelIfTourOpened('Subsystems'),
		popover: {
			title: 'Subsystems',
			description: `
				<p>Group blocks into Subsystems for hierarchy:</p>
				<ul>
					<li>Double-click a Subsystem on the canvas to drill in</li>
					<li>Breadcrumb at the top tracks your current path</li>
					<li>Tree gives an outline of all nested levels</li>
				</ul>
				<table>
					<tr><td>Open tree</td><td><kbd>R</kbd></td></tr>
					<tr><td>Go to root</td><td><kbd>H</kbd></td></tr>
				</table>
			`,
			side: 'right',
			align: 'center'
		}
	},
	{
		popover: {
			title: 'Find',
			description: `
				<p><kbd>Ctrl/Cmd+F</kbd> opens the search dialog. Jump to any block or event by name across the whole graph, including nested subsystems.</p>
			`
		}
	},
	{
		element: '.toolbar-btn[aria-label="Toggle theme"]',
		popover: {
			title: 'Theme',
			description: `
				<p>Toggle between light and dark theme. Your choice is remembered across sessions.</p>
				<p>Shortcut: <kbd>T</kbd></p>
			`,
			side: 'bottom',
			align: 'end'
		}
	},
	{
		popover: {
			title: 'View Controls',
			description: `
				<table>
					<tr><td>Fit view</td><td><kbd>F</kbd></td></tr>
					<tr><td>Zoom in</td><td><kbd>+</kbd></td></tr>
					<tr><td>Zoom out</td><td><kbd>-</kbd></td></tr>
					<tr><td>Pan</td><td>drag empty canvas</td></tr>
					<tr><td>Zoom under cursor</td><td>scroll</td></tr>
				</table>
			`
		}
	},
	{
		element: '.toolbar-group:has(.toolbar-btn[aria-label="Save"])',
		popover: {
			title: 'Files & Sharing',
			description: `
				<p>Save and load <code>.pvm</code> files. Buttons left to right: New, Open, Save, Save As, View Python Code, Send to Codegen.</p>
				<table>
					<tr><td>Open</td><td><kbd>Ctrl/Cmd+O</kbd></td></tr>
					<tr><td>Save</td><td><kbd>Ctrl/Cmd+S</kbd></td></tr>
					<tr><td>Save as</td><td><kbd>Ctrl/Cmd+Shift+S</kbd></td></tr>
					<tr><td>View Python</td><td><kbd>Ctrl/Cmd+E</kbd></td></tr>
				</table>
				<p>Models can also load via URL: <code>?model=&lt;url&gt;</code> or <code>?modelgh=owner/repo/path/file.pvm</code>.</p>
			`,
			side: 'bottom',
			align: 'center'
		}
	},
	{
		element: '.toolbar-btn[aria-label="Keyboard shortcuts"]',
		popover: {
			title: 'Open Keyboard Shortcuts',
			description: `
				<p>The full reference is grouped by category. Click <strong>Next</strong> to open it.</p>
			`,
			side: 'bottom',
			align: 'end',
			onNextClick: clickAndAdvance('.toolbar-btn[aria-label="Keyboard shortcuts"]', 250)
		}
	},
	{
		element: '.dialog.glass-panel',
		popover: {
			title: 'Keyboard Shortcuts',
			description: `
				<p>Reference for every shortcut: file, edit, transform, view, panels and run.</p>
				<p>Press <kbd>?</kbd> anywhere to open it.</p>
				<p>That's the editor tour. Modeling shows how to build and customise blocks.</p>
			`,
			side: 'left',
			align: 'center',
			onNextClick: closeDialogAndAdvance(),
			onPopoverRender: addNextTourButton('customization', 'Continue with Modeling →')
		}
	}
];

/* --- Modeling Tour (build & customise blocks) ------------------------- */

const customizationSteps: DriveStep[] = [
	{
		popover: {
			title: 'Modeling Tour',
			description: `
				<p>How to build and customise blocks: selection, transform, properties, pinning, naming, colors, icons, port labels and annotations.</p>
				<p>The demo model is loaded so each step refers to a concrete block.</p>
			`
		}
	},
	{
		element: () => blockElement(0),
		onHighlightStarted: () => {
			const id = getBlockId(0);
			if (id) graphStore.selectNode(id);
		},
		popover: {
			title: 'Selection',
			description: `
				<p>The first block is now selected (notice the highlight on the canvas).</p>
				<ul>
					<li>Click a block to select it</li>
					<li><kbd>Shift</kbd>+click adds to selection</li>
					<li><kbd>Shift</kbd>+drag draws a marquee box</li>
				</ul>
				<table>
					<tr><td>Select all</td><td><kbd>Ctrl/Cmd+A</kbd></td></tr>
					<tr><td>Deselect</td><td><kbd>Esc</kbd></td></tr>
				</table>
			`,
			side: 'right',
			align: 'center'
		}
	},
	{
		element: () => blockElement(0),
		popover: {
			title: 'Transform',
			description: `
				<p>Once a block (or several) is selected, transform with these shortcuts:</p>
				<table>
					<tr><td>Rotate 90°</td><td><kbd>R</kbd></td></tr>
					<tr><td>Flip horizontal</td><td><kbd>X</kbd></td></tr>
					<tr><td>Flip vertical</td><td><kbd>Y</kbd></td></tr>
					<tr><td>Nudge</td><td>arrow keys</td></tr>
					<tr><td>Nudge × 10</td><td><kbd>Shift</kbd>+arrow</td></tr>
				</table>
			`,
			side: 'right',
			align: 'center'
		}
	},
	{
		element: '.svelte-flow__pane',
		popover: {
			title: 'Edit Operations',
			description: `
				<table>
					<tr><td>Undo</td><td><kbd>Ctrl/Cmd+Z</kbd></td></tr>
					<tr><td>Redo</td><td><kbd>Ctrl/Cmd+Y</kbd></td></tr>
					<tr><td>Cut</td><td><kbd>Ctrl/Cmd+X</kbd></td></tr>
					<tr><td>Copy</td><td><kbd>Ctrl/Cmd+C</kbd></td></tr>
					<tr><td>Paste</td><td><kbd>Ctrl/Cmd+V</kbd></td></tr>
					<tr><td>Duplicate</td><td><kbd>Ctrl/Cmd+D</kbd></td></tr>
					<tr><td>Delete</td><td><kbd>Del</kbd></td></tr>
				</table>
				<p>Paste lands at the cursor; duplicate offsets slightly from the original.</p>
			`,
			side: 'right',
			align: 'center'
		}
	},
	{
		element: '.svelte-flow__node',
		popover: {
			title: 'Right-click Context Menu',
			description: `
				<p>Right-click on any block, edge or canvas area for context-sensitive actions:</p>
				<ul>
					<li>Properties, View Code, Export</li>
					<li>Duplicate, Copy, Delete</li>
					<li>Toggle Icon mode and Port Labels per-block</li>
					<li>Edge: Reset Route to clear manual waypoints</li>
				</ul>
			`,
			side: 'right',
			align: 'start'
		}
	},
	{
		element: '.svelte-flow__node',
		popover: {
			title: 'Open Block Properties',
			description: `
				<p>Double-click any block to open its Properties dialog. Click <strong>Next</strong> to open it for the first block.</p>
			`,
			side: 'right',
			align: 'start',
			onNextClick: openFirstBlockProperties()
		}
	},
	{
		element: '.properties-dialog',
		popover: {
			title: 'Block Properties',
			description: `
				<p>Every parameter is editable here:</p>
				<ul>
					<li>Numeric, string, callable, list parameters</li>
					<li>Display name (rename for clarity)</li>
					<li>Color picker for the accent</li>
					<li>Pin parameters to surface them on the canvas</li>
				</ul>
			`,
			side: 'left',
			align: 'center',
			onNextClick: closeDialogAndAdvance()
		}
	},
	{
		element: '.node-name-input',
		onHighlightStarted: () => {
			const id = getBlockId(1);
			if (id) {
				openNodeDialog(id);
				graphStore.updateNodeName(id, 'Lowpass Filter');
			}
		},
		popover: {
			title: 'Block Names',
			description: `
				<p>The Butterworth filter has been renamed to <strong>Lowpass Filter</strong>. Display names are independent of the block's type — use them to describe what the block does in your model.</p>
				<p>Click into this field to edit it yourself.</p>
			`,
			side: 'left',
			align: 'start'
		}
	},
	{
		element: '.node-name-input',
		onHighlightStarted: () => {
			const id = getBlockId(1);
			if (id) {
				openNodeDialog(id);
				graphStore.updateNodeName(id, 'LP $\\frac{1}{1 + (s/\\omega_c)^N}$');
			}
		},
		popover: {
			title: 'LaTeX in Names',
			description: `
				<p>Wrap inline math in <code>$…$</code> in any block name to render it with KaTeX. The block on the canvas shows the math glyph; the field here keeps the source.</p>
				<ul>
					<li><code>PT1: $\\frac{K}{1+sT}$</code></li>
					<li><code>$\\dot{x} = Ax + Bu$</code></li>
				</ul>
			`,
			side: 'left',
			align: 'start'
		}
	},
	{
		element: '.color-picker-wrapper',
		onHighlightStarted: () => {
			const id = getBlockId(1);
			if (id) {
				openNodeDialog(id);
				graphStore.updateNodeColor(id, '#e25c5c');
			}
		},
		popover: {
			title: 'Block Colors',
			description: `
				<p>The accent color of this block has been changed. Use the color picker in Properties to group blocks belonging to the same logical signal path or subsystem at a glance.</p>
				<p>The color also applies to the block's pinned parameters and selection highlight.</p>
			`,
			side: 'right',
			align: 'center'
		}
	},
	{
		element: '.pin-btn',
		onHighlightStarted: () => {
			const id = getBlockId(0);
			const node = id ? graphStore.getNode(id) : null;
			if (id && node) {
				openNodeDialog(id);
				const firstParam = Object.keys(node.params ?? {}).find((k) => !k.startsWith('_'));
				const existing = node.pinnedParams ?? [];
				if (firstParam && !existing.includes(firstParam)) {
					graphStore.updateNode(id, { pinnedParams: [...existing, firstParam] });
				}
			}
		},
		popover: {
			title: 'Parameter Pinning',
			description: `
				<p>The first parameter of this block has just been pinned (see the new field on the block on the canvas). Click any pin icon in the Properties parameters list to surface that parameter on the block, editable inline.</p>
				<p>Useful for tweaking gain, time constant, initial value or limit without re-opening the dialog every time.</p>
			`,
			side: 'left',
			align: 'start'
		}
	},
	{
		element: '.svelte-flow__pane',
		onHighlightStarted: () => {
			closeNodeDialog();
			if (savedIconMode === null) savedIconMode = iconModeStore.get();
			iconModeStore.set(true);
			refreshTourSoon(320);
		},
		popover: {
			title: 'Block Icons',
			description: `
				<p>Icon mode has been turned on. Every block now shows its Simulink-style icon: a programmatic plot, math glyph or schematic symbol.</p>
				<ul>
					<li>Global toggle: <kbd>I</kbd></li>
					<li>Per-block override: right-click → "Show as Icon" / "Show as Text"</li>
				</ul>
				<p>Icon mode resets back to your previous preference when the tour ends.</p>
			`,
			side: 'right',
			align: 'center'
		}
	},
	{
		element: '.svelte-flow__pane',
		onHighlightStarted: () => {
			if (savedPortLabels === null) savedPortLabels = portLabelsStore.get();
			portLabelsStore.set(true);
			refreshTourSoon(320);
		},
		popover: {
			title: 'Port Labels',
			description: `
				<p>Port labels are now visible on every block. Useful for blocks with many ports (StateSpace, Subsystem, Function).</p>
				<ul>
					<li>Global toggle: <kbd>L</kbd></li>
					<li>Per-block override: right-click context menu</li>
				</ul>
			`,
			side: 'right',
			align: 'center'
		}
	},
	{
		element: () =>
			document.querySelector('.annotation')?.closest('.svelte-flow__node') ??
			document.querySelector('.svelte-flow__pane') ??
			document.body,
		popover: {
			title: 'Canvas Annotations',
			description: `
				<p>The note already on the canvas is a Canvas Annotation that comes with this demo. Right-click on empty canvas → <strong>Add Annotation</strong> to drop your own.</p>
				<p>Annotations support Markdown and LaTeX, with adjustable font size via the annotation's context menu. Use them for inline documentation, equations or reminders.</p>
				<p>That's the modeling tour. The Simulation tour shows how to run and inspect the model.</p>
			`,
			side: 'right',
			align: 'center',
			onPopoverRender: addNextTourButton('simulation', 'Continue with Simulation →')
		}
	}
];

/* --- Simulation Tour (run & inspect) ---------------------------------- */

const simulationSteps: DriveStep[] = [
	{
		popover: {
			title: 'Simulation Tour',
			description: `
				<p>Set up, run and inspect a simulation. The demo model has a recording block so plots come alive when we run.</p>
			`
		}
	},
	{
		element: '.toggle-btn[aria-label="Simulation"]',
		popover: {
			title: 'Simulation Toggle',
			description: `
				<p>Opens the Simulation settings panel on the right.</p>
				<p>Shortcut: <kbd>S</kbd></p>
			`,
			side: 'left',
			align: 'center',
			onNextClick: openPanelAndAdvance('Simulation')
		}
	},
	{
		element: '[data-panel="Simulation"]',
		popover: {
			title: 'Simulation Settings',
			description: `
				<p>Configure the integrator:</p>
				<ul>
					<li><strong>Solver</strong>: RK4, RK45, BDF, Radau, LSODA, …</li>
					<li><strong>Timestep</strong> (fixed) or initial step (adaptive)</li>
					<li><strong>End time</strong> and tolerances (rtol, atol)</li>
					<li><strong>Run</strong>, <strong>Continue</strong> and <strong>Stop</strong> buttons</li>
				</ul>
			`,
			side: 'left',
			align: 'center'
		}
	},
	{
		element: '.toggle-btn[aria-label="Editor"]',
		popover: {
			title: 'Code Editor Toggle',
			description: `
				<p>Opens the Python code editor.</p>
				<p>Shortcut: <kbd>E</kbd></p>
			`,
			side: 'right',
			align: 'start',
			onNextClick: openPanelAndAdvance('Editor')
		}
	},
	{
		element: '[data-panel="Editor"]',
		popover: {
			title: 'Code Editor',
			description: `
				<p>Shared Python code for the whole graph. Anything defined here is available to blocks that take a callable:</p>
				<ul>
					<li><code>Function</code> — algebraic transforms</li>
					<li><code>Source</code> — time-dependent inputs</li>
					<li><code>ODE</code>, <code>DynamicalSystem</code> — right-hand sides</li>
					<li><code>Switch</code>, <code>Wrapper</code>, conditions</li>
				</ul>
				<p>Use it for shared constants, helper functions, lookup tables.</p>
			`,
			side: 'right',
			align: 'center'
		}
	},
	{
		element: '.toggle-btn[aria-label="Events"]',
		popover: {
			title: 'Events Toggle',
			description: `
				<p>Opens the Events panel.</p>
				<p>Shortcut: <kbd>N</kbd></p>
			`,
			side: 'right',
			align: 'start',
			onNextClick: openPanelAndAdvance('Events')
		}
	},
	{
		element: '[data-panel="Events"]',
		popover: {
			title: 'Events',
			description: `
				<p>Discrete events that interrupt or modify the integration:</p>
				<ul>
					<li><strong>Schedule</strong> — fire at fixed times</li>
					<li><strong>ZeroCrossing</strong> — trigger when a signal crosses a threshold</li>
					<li><strong>Condition</strong> — trigger when a Python expression turns true</li>
				</ul>
				<p>Each event can modify block parameters or call user code. The bouncing-ball demo uses an event for the floor collision.</p>
			`,
			side: 'right',
			align: 'center'
		}
	},
	{
		element: '.toolbar-btn[aria-label="Run"]',
		popover: {
			title: 'Run',
			description: `
				<p>Now we've seen everything that goes <em>into</em> a simulation. Click <strong>Next</strong> to actually run it and watch the live results fill in.</p>
				<p>Shortcut: <kbd>Ctrl/Cmd+Enter</kbd></p>
			`,
			side: 'bottom',
			align: 'center',
			onNextClick: runSimulation()
		}
	},
	{
		element: '[data-panel="Results"]',
		popover: {
			title: 'Results / Plots',
			description: `
				<p>The Results panel opens automatically on the first run. Live plots from <code>Scope</code> and <code>Spectrum</code> blocks update as the simulation progresses:</p>
				<ul>
					<li>Tabs per recording block, or single combined view</li>
					<li>Pan, zoom, hover for values</li>
					<li>Right-click for plot options and export to CSV</li>
				</ul>
				<p>Shortcut to toggle: <kbd>V</kbd></p>
			`,
			side: 'top',
			align: 'center'
		}
	},
	{
		element: '[data-panel="Console"]',
		popover: {
			title: 'Console',
			description: `
				<p>The Console also opens automatically on the first run. It collects stdout, stderr and PathSim diagnostics:</p>
				<ul>
					<li>Solver warnings and progress messages</li>
					<li><code>print()</code> output from your blocks</li>
					<li>Errors with clickable links to the offending block</li>
				</ul>
				<p>Shortcut to toggle: <kbd>C</kbd></p>
			`,
			side: 'top',
			align: 'center'
		}
	},
	{
		element: '.toolbar-btn[aria-label="Pin Previews"]',
		popover: {
			title: 'Pinned Plot Previews',
			description: `
				<p>Pin miniature plot previews directly next to recording blocks on the canvas. The trace stays visible without opening the Results panel.</p>
				<p>Shortcut: <kbd>P</kbd></p>
			`,
			side: 'bottom',
			align: 'end'
		}
	},
	{
		popover: {
			title: 'Continue & Stop',
			description: `
				<table>
					<tr><td>Continue from current state</td><td><kbd>Shift+Enter</kbd></td></tr>
					<tr><td>Stop</td><td><kbd>Esc</kbd></td></tr>
				</table>
				<p>Continue is useful for stepping through long runs interactively without resetting — adds wall-time without re-initialising state.</p>
			`
		}
	},
	{
		element: '.toolbar-btn[aria-label="View Python Code"]',
		popover: {
			title: 'Open Python Export',
			description: `
				<p>Generate a standalone Python script of the current simulation. Click <strong>Next</strong> to open it.</p>
			`,
			side: 'bottom',
			align: 'end',
			onNextClick: clickAndAdvance('.toolbar-btn[aria-label="View Python Code"]', 250)
		}
	},
	{
		element: '.dialog.glass-panel',
		popover: {
			title: 'Python Export',
			description: `
				<p>The exported script is self-contained — copy, save or send to the Codegen tool. Useful for:</p>
				<ul>
					<li>Codegen for production deployment</li>
					<li>Version control of the simulation</li>
					<li>Running headless outside the browser</li>
				</ul>
				<p>Shortcut: <kbd>Ctrl/Cmd+E</kbd></p>
				<p>That's it — you've seen all three tours. Happy simulating!</p>
			`,
			side: 'left',
			align: 'center',
			onNextClick: closeDialogAndAdvance()
		}
	}
];

/* --- Public API ------------------------------------------------------- */

export type TourId = 'ui' | 'simulation' | 'customization';

/** Demo model paired with each tour. Loaded on confirmation when the tour
 *  starts so steps can refer to concrete blocks, panels and traces. */
const tourModels: Record<TourId, { file: string; name: string }> = {
	ui: { file: 'pid-subsystem.json', name: 'PID Loop' },
	customization: { file: 'squarewave-lpf.json', name: 'Squarewave LPF' },
	simulation: { file: 'bouncing-ball.json', name: 'Bouncing Ball' }
};

export async function startGuidedTour(id: TourId): Promise<void> {
	const stepsByTour: Record<TourId, DriveStep[]> = {
		ui: startSteps,
		customization: customizationSteps,
		simulation: simulationSteps
	};

	const demo = tourModels[id];
	const wantsLoad = await confirmationStore.show({
		title: 'Load demo model?',
		message: `This tour works best with the "${demo.name}" example model. Loading replaces your current graph — save first if needed.`,
		confirmText: 'Load demo',
		cancelText: 'Continue without'
	});

	if (wantsLoad) {
		const url = `${base}/examples/${demo.file}`;
		const result = await importFromUrl(url);
		if (result.success) {
			await new Promise((r) => setTimeout(r, 250));
			triggerFitView();
			await new Promise((r) => setTimeout(r, 350));
		}
	}

	activeTour = driver({ ...baseConfig(), steps: stepsByTour[id] });
	activeTour.drive();
}
