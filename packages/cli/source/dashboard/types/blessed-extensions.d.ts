/**
 * Type extensions for blessed library
 *
 * The @types/blessed package is incomplete and missing many properties
 * that are actually available in the blessed library. This file provides
 * proper typing for those missing properties.
 */

import * as blessed from "blessed";

declare module "blessed" {
	namespace Widgets {
		interface ListElement {
			/** Currently selected item index */
			selected: number;
			/** Move selection up by n items */
			up(n?: number): void;
			/** Move selection down by n items */
			down(n?: number): void;
			/** Internal render cache */
			_clines?: string[];
		}

		interface Node {
			/** Force render of this element */
			render(): void;
		}

		interface Screen {
			/** Destroy the screen and cleanup resources */
			destroy(): void;
			/** Program instance with terminal control */
			program: BlessedProgram;
			/** Grab all input (mouse and keyboard) */
			grabInput?(options: { mouse: boolean }): void;
		}

		interface BlessedProgram {
			/** Enable keypad mode for better key handling */
			keypad?(enable: boolean): void;
		}
	}
}

// Custom event for screen restart
declare global {
	namespace NodeJS {
		interface Process {
			on(event: "blessed-screen-restart", listener: () => void): this;
			emit(event: "blessed-screen-restart"): boolean;
		}
	}
}
