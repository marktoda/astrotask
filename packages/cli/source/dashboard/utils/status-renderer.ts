/**
 * @fileoverview Status Renderer for Astrolabe TUI
 *
 * Implements the enhanced status glyph and color system as specified in the design doc.
 * Supports Unicode glyphs with ASCII fallbacks and WCAG-AA compliant color palette.
 *
 * Design Doc Reference:
 * - Pending: ◻ (#9CA3AF Gray-400) / ASCII: [ ]
 * - In-Progress: ⟳ (#FBBF24 Amber-400) / ASCII: {>}
 * - Blocked: ⛔ (#F87171 Red-400) / ASCII: !X
 * - Done: ✔ (#34D399 Green-400) / ASCII: [x]
 *
 * @module dashboard/utils/status-renderer
 * @since 1.0.0
 */

import type { TaskStatus } from "@astrotask/core";

/**
 * Status glyph configuration
 */
export interface StatusGlyph {
	unicode: string;
	ascii: string;
	color: string;
	description: string;
}

/**
 * Terminal capability flags
 */
export interface TerminalCapabilities {
	supportsUnicode: boolean;
	supportsColor: boolean;
	colorDepth: "16" | "256" | "truecolor";
}

/**
 * Renderer configuration options
 */
export interface StatusRendererOptions {
	forceAscii?: boolean;
	forceNoColor?: boolean;
	useHighContrast?: boolean;
}

/**
 * WCAG-AA compliant color palette for status rendering
 */
export const STATUS_COLORS = {
	pending: "#9CA3AF", // Gray-400
	"in-progress": "#FBBF24", // Amber-400
	blocked: "#F87171", // Red-400
	done: "#34D399", // Green-400
	cancelled: "#6B7280", // Gray-500 (legacy)
	archived: "#9CA3AF", // Gray-400 (legacy)
} as const;

/**
 * High contrast color variants for accessibility
 */
export const HIGH_CONTRAST_COLORS = {
	pending: "#FFFFFF", // White
	"in-progress": "#FFFF00", // Bright yellow
	blocked: "#FF0000", // Bright red
	done: "#00FF00", // Bright green
	cancelled: "#808080", // Gray
	archived: "#C0C0C0", // Light gray
} as const;

/**
 * Status glyph definitions with Unicode and ASCII variants
 */
export const STATUS_GLYPHS: Record<TaskStatus, StatusGlyph> = {
	pending: {
		unicode: "○",
		ascii: "( )",
		color: STATUS_COLORS.pending,
		description: "Pending - Empty Circle",
	},
	"in-progress": {
		unicode: "●",
		ascii: "(>)",
		color: STATUS_COLORS["in-progress"],
		description: "In-Progress - Filled Circle",
	},
	blocked: {
		unicode: "⛔",
		ascii: "!X",
		color: STATUS_COLORS.blocked,
		description: "Blocked - No Entry Sign",
	},
	done: {
		unicode: "✓",
		ascii: "[x]",
		color: STATUS_COLORS.done,
		description: "Done - Check Mark",
	},
	cancelled: {
		unicode: "✗",
		ascii: "[!]",
		color: STATUS_COLORS.cancelled,
		description: "Cancelled - Cross Mark",
	},
	archived: {
		unicode: "⧈",
		ascii: "[A]",
		color: STATUS_COLORS.archived,
		description: "Archived - Archive Box",
	},
};

/**
 * Status renderer class providing glyph and color rendering with terminal capability detection
 */
export class StatusRenderer {
	private capabilities: TerminalCapabilities;
	private options: StatusRendererOptions;

	constructor(options: StatusRendererOptions = {}) {
		this.options = options;
		this.capabilities = this.detectTerminalCapabilities();
	}

	/**
	 * Detect terminal capabilities for Unicode and color support
	 */
	private detectTerminalCapabilities(): TerminalCapabilities {
		// If forced ASCII mode, disable Unicode
		if (this.options.forceAscii) {
			return {
				supportsUnicode: false,
				supportsColor: !this.options.forceNoColor,
				colorDepth: this.getColorDepth(),
			};
		}

		return {
			supportsUnicode: this.detectUnicodeSupport(),
			supportsColor: this.detectColorSupport(),
			colorDepth: this.getColorDepth(),
		};
	}

	/**
	 * Detect Unicode support based on environment and terminal type
	 */
	private detectUnicodeSupport(): boolean {
		// Check environment variables that indicate Unicode support
		const lang =
			process.env["LANG"] ||
			process.env["LC_ALL"] ||
			process.env["LC_CTYPE"] ||
			"";
		const term = process.env["TERM"] || "";

		// UTF-8 environments typically support Unicode
		if (lang.includes("UTF-8") || lang.includes("utf8")) {
			return true;
		}

		// Modern terminal emulators with good Unicode support
		const unicodeTerminals = [
			"xterm-256color",
			"screen-256color",
			"tmux-256color",
			"alacritty",
			"kitty",
			"iterm2",
			"gnome-terminal",
			"konsole",
			"terminator",
		];

		if (unicodeTerminals.some((t) => term.includes(t))) {
			return true;
		}

		// Windows Terminal and WSL
		if (process.env["WT_SESSION"] || process.env["WSL_DISTRO_NAME"]) {
			return true;
		}

		// Fallback: test render a Unicode character (basic check)
		// This is a heuristic - in a real implementation we might
		// try to measure character width or use more sophisticated detection
		return !process.env["ASCII_ONLY"];
	}

	/**
	 * Detect color support
	 */
	private detectColorSupport(): boolean {
		if (this.options.forceNoColor || process.env["NO_COLOR"]) {
			return false;
		}

		// Check for explicit color support
		if (process.env["FORCE_COLOR"] || process.env["COLORTERM"]) {
			return true;
		}

		// Check TERM variable for color support
		const term = process.env["TERM"] || "";
		return (
			term.includes("color") ||
			term.includes("256") ||
			term.includes("truecolor")
		);
	}

	/**
	 * Determine color depth capability
	 */
	private getColorDepth(): "16" | "256" | "truecolor" {
		const term = process.env["TERM"] || "";
		const colorterm = process.env["COLORTERM"] || "";

		// True color support
		if (colorterm === "truecolor" || colorterm === "24bit") {
			return "truecolor";
		}

		// 256 color support
		if (term.includes("256") || term.includes("xterm")) {
			return "256";
		}

		// Basic 16 color support
		return "16";
	}

	/**
	 * Get the appropriate glyph for a status
	 */
	getGlyph(status: TaskStatus): string {
		const config = STATUS_GLYPHS[status];
		if (!config) {
			return this.capabilities.supportsUnicode ? "?" : "[?]";
		}

		return this.capabilities.supportsUnicode ? config.unicode : config.ascii;
	}

	/**
	 * Get the color for a status (returns blessed.js compatible color format)
	 */
	getColor(status: TaskStatus): string {
		if (!this.capabilities.supportsColor) {
			return "white"; // Fallback for no-color terminals
		}

		const colorMap = this.options.useHighContrast
			? HIGH_CONTRAST_COLORS
			: STATUS_COLORS;
		const hexColor = colorMap[status];

		if (!hexColor) {
			return "white";
		}

		// Convert hex to blessed.js format based on terminal capabilities
		return this.hexToBlessedColor(hexColor);
	}

	/**
	 * Convert hex color to blessed.js compatible format
	 */
	private hexToBlessedColor(hex: string): string {
		// For true color terminals, blessed.js supports hex directly
		if (this.capabilities.colorDepth === "truecolor") {
			return hex;
		}

		// For other terminals, map to nearest blessed.js color names
		const colorMapping: Record<string, string> = {
			"#9CA3AF": "gray", // pending/archived
			"#FBBF24": "yellow", // in-progress
			"#F87171": "red", // blocked
			"#34D399": "green", // done
			"#6B7280": "gray", // cancelled
			"#FFFFFF": "white", // high contrast white
			"#FFFF00": "yellow", // high contrast yellow
			"#FF0000": "red", // high contrast red
			"#00FF00": "green", // high contrast green
			"#808080": "gray", // high contrast gray
			"#C0C0C0": "white", // high contrast light gray
		};

		return colorMapping[hex] || "white";
	}

	/**
	 * Render a status with glyph and color (returns blessed.js formatted string)
	 */
	renderStatus(status: TaskStatus): string {
		const glyph = this.getGlyph(status);
		const color = this.getColor(status);

		if (!this.capabilities.supportsColor) {
			return glyph;
		}

		// Return blessed.js color tag format
		return `{${color}-fg}${glyph}{/${color}-fg}`;
	}

	/**
	 * Render a plain status glyph without color formatting
	 */
	renderStatusPlain(status: TaskStatus): string {
		return this.getGlyph(status);
	}

	/**
	 * Get terminal capabilities for debugging
	 */
	getCapabilities(): TerminalCapabilities {
		return { ...this.capabilities };
	}

	/**
	 * Get legend text for status meanings
	 */
	getLegendText(): string {
		const statuses: TaskStatus[] = [
			"pending",
			"in-progress",
			"blocked",
			"done",
		];
		const items = statuses.map((status) => {
			const glyph = this.getGlyph(status);
			const description =
				STATUS_GLYPHS[status]?.description.split(" - ")[0] || status;
			return `${glyph} ${description}`;
		});

		return items.join("  ");
	}

	/**
	 * Create a renderer with different options
	 */
	withOptions(options: StatusRendererOptions): StatusRenderer {
		return new StatusRenderer({ ...this.options, ...options });
	}

	/**
	 * Static factory method for default renderer
	 */
	static create(options?: StatusRendererOptions): StatusRenderer {
		return new StatusRenderer(options);
	}

	/**
	 * Static factory method for ASCII-only renderer
	 */
	static createAscii(): StatusRenderer {
		return new StatusRenderer({ forceAscii: true });
	}

	/**
	 * Static factory method for high-contrast renderer
	 */
	static createHighContrast(): StatusRenderer {
		return new StatusRenderer({ useHighContrast: true });
	}
}

/**
 * Default status renderer instance
 */
export const defaultStatusRenderer = StatusRenderer.create();

/**
 * Convenience function to render a status with the default renderer
 */
export function renderTaskStatus(status: TaskStatus): string {
	return defaultStatusRenderer.renderStatus(status);
}

/**
 * Convenience function to get a plain status glyph
 */
export function getTaskStatusGlyph(status: TaskStatus): string {
	return defaultStatusRenderer.getGlyph(status);
}
