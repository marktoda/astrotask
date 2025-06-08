/**
 * @fileoverview Color Integration System for Astrolabe TUI
 *
 * Handles the integration between status glyph colors and dependency relationship highlighting.
 * Ensures WCAG-AA colors work properly with blessed.js theming and background overlays.
 *
 * @module dashboard/utils/color-integration
 * @since 1.0.0
 */

import { StatusRenderer } from "./status-renderer.js";

/**
 * Dependency relationship types for color coding
 */
export type DependencyRelationship =
	| "blocking-pending"
	| "blocking-completed"
	| "dependent"
	| "related"
	| "none";

/**
 * Color styling configuration
 */
export interface ColorStylingConfig {
	/** Whether to use background colors for dependency highlighting */
	useBackgroundHighlighting: boolean;
	/** Whether to use bold/dim styling for emphasis */
	useTextStyling: boolean;
	/** Whether to preserve status glyph colors in highlighted rows */
	preserveStatusColors: boolean;
	/** Status renderer to use for glyph colors */
	statusRenderer: StatusRenderer;
}

/**
 * Color styling result
 */
export interface StyledTaskLine {
	/** The final styled line ready for blessed.js */
	styledLine: string;
	/** Whether the line has dependency highlighting */
	hasHighlighting: boolean;
	/** The original unstyledLine for reference */
	originalLine: string;
}

/**
 * Enhanced color integration system that handles both status colors and dependency highlighting
 */
export class ColorIntegrationSystem {
	private config: ColorStylingConfig;

	constructor(config: Partial<ColorStylingConfig> = {}) {
		this.config = {
			useBackgroundHighlighting: true,
			useTextStyling: true,
			preserveStatusColors: true,
			statusRenderer: StatusRenderer.create(),
			...config,
		};
	}

	/**
	 * Apply enhanced styling that preserves status glyph colors while adding dependency highlighting
	 */
	styleTaskLine(
		originalLine: string,
		relationship: DependencyRelationship,
	): StyledTaskLine {
		// If no relationship, return the original line unchanged
		if (relationship === "none") {
			return {
				styledLine: originalLine,
				hasHighlighting: false,
				originalLine,
			};
		}

		let styledLine = originalLine;

		// Apply dependency highlighting based on relationship
		if (this.config.useBackgroundHighlighting) {
			styledLine = this.applyBackgroundHighlighting(styledLine, relationship);
		} else {
			styledLine = this.applyForegroundHighlighting(styledLine, relationship);
		}

		// Apply additional text styling if enabled
		if (this.config.useTextStyling) {
			styledLine = this.applyTextStyling(styledLine, relationship);
		}

		return {
			styledLine,
			hasHighlighting: true,
			originalLine,
		};
	}

	/**
	 * Apply background color highlighting that preserves foreground colors
	 */
	private applyBackgroundHighlighting(
		line: string,
		relationship: DependencyRelationship,
	): string {
		// Skip 'none' relationship
		if (relationship === "none") return line;

		const bgColors = {
			"blocking-pending": "red", // Red background for blocking pending
			"blocking-completed": "green", // Green background for blocking completed
			dependent: "blue", // Blue background for dependent
			related: "yellow", // Yellow background for related
		} as const;

		const bgColor = bgColors[relationship];
		if (!bgColor) return line;

		// Apply background color while preserving existing foreground colors
		// This is more complex because we need to handle existing color tags
		return this.applyBackgroundColorToLine(line, bgColor);
	}

	/**
	 * Apply foreground color highlighting (fallback for terminals without background color support)
	 */
	private applyForegroundHighlighting(
		line: string,
		relationship: DependencyRelationship,
	): string {
		// Skip 'none' relationship
		if (relationship === "none") return line;

		// This is the old approach - apply foreground color to entire line
		// Only use this as fallback when background highlighting is disabled

		const fgColors = {
			"blocking-pending": "red",
			"blocking-completed": "green",
			dependent: "blue",
			related: "yellow",
		} as const;

		const fgColor = fgColors[relationship];
		if (!fgColor) return line;

		// Strip existing ANSI codes if preserving status colors is disabled
		if (!this.config.preserveStatusColors) {
			const plainLine = this.stripAnsiCodes(line);
			return `{${fgColor}-fg}${plainLine}{/${fgColor}-fg}`;
		}

		// If preserving status colors, we need a more sophisticated approach
		return this.applyForegroundColorPreservingExisting(line, fgColor);
	}

	/**
	 * Apply background color to line while preserving existing foreground colors
	 */
	private applyBackgroundColorToLine(line: string, bgColor: string): string {
		// For blessed.js, we can combine background and foreground colors
		// by wrapping the entire line with background color
		// and ensuring existing foreground colors are preserved

		// The approach is to wrap the entire line with background color
		// Blessed.js will handle the combination of fg and bg colors
		return `{${bgColor}-bg}${line}{/${bgColor}-bg}`;
	}

	/**
	 * Apply foreground color while trying to preserve existing colors (complex)
	 */
	private applyForegroundColorPreservingExisting(
		line: string,
		fgColor: string,
	): string {
		// This is complex because we need to parse existing color tags
		// For now, we'll use a simpler approach: apply the dependency color
		// but with lower intensity/opacity

		// Use dim versions of dependency colors to avoid overwhelming status colors
		const dimColors = {
			red: "gray",
			green: "gray",
			blue: "gray",
			yellow: "gray",
		};

		const dimColor = dimColors[fgColor as keyof typeof dimColors] || "gray";
		return `{${dimColor}-fg}${line}{/${dimColor}-fg}`;
	}

	/**
	 * Apply text styling (bold, dim, etc.) based on relationship
	 */
	private applyTextStyling(
		line: string,
		relationship: DependencyRelationship,
	): string {
		// Skip 'none' relationship
		if (relationship === "none") return line;

		const stylings = {
			"blocking-pending": "bold", // Bold for critical blocking
			"blocking-completed": "normal", // Normal for completed blocking
			dependent: "normal", // Normal for dependent
			related: "normal", // Normal for related
		} as const;

		const styling = stylings[relationship];
		if (styling === "bold") {
			return `{bold}${line}{/bold}`;
		}

		return line;
	}

	/**
	 * Strip ANSI color codes from a string
	 */
	private stripAnsiCodes(str: string): string {
		// Remove blessed.js color tags and ANSI escape codes
		return str
			.replace(/\{[^}]*\}/g, "") // Remove blessed.js tags like {red-fg}
			.replace(/\x1b\[[0-9;]*m/g, ""); // Remove ANSI codes
	}

	/**
	 * Create a legend showing how dependency relationships are visually encoded
	 */
	getLegendText(): string {
		const relationships = [
			{
				type: "blocking-pending",
				desc: "⚠ Blocking (pending)",
				sample: "red bg",
			},
			{
				type: "blocking-completed",
				desc: "✓ Blocking (done)",
				sample: "green bg",
			},
			{ type: "dependent", desc: "← Dependent", sample: "blue bg" },
			{ type: "related", desc: "~ Related", sample: "yellow bg" },
		];

		return relationships.map((r) => `${r.desc}: ${r.sample}`).join("  ");
	}

	/**
	 * Test color combinations for accessibility and readability
	 */
	testColorCombinations(): string[] {
		const issues: string[] = [];

		// For now, just document that this should be tested manually
		// TODO: Implement automated accessibility testing for status colors on dependency backgrounds
		issues.push(
			"Manual testing required: Status glyphs on dependency backgrounds",
		);

		return issues;
	}

	/**
	 * Get current configuration
	 */
	getConfig(): ColorStylingConfig {
		return { ...this.config };
	}

	/**
	 * Create a new system with updated configuration
	 */
	withConfig(updates: Partial<ColorStylingConfig>): ColorIntegrationSystem {
		return new ColorIntegrationSystem({ ...this.config, ...updates });
	}

	/**
	 * Static factory for default color integration system
	 */
	static create(config?: Partial<ColorStylingConfig>): ColorIntegrationSystem {
		return new ColorIntegrationSystem(config);
	}

	/**
	 * Static factory for background-only highlighting (preserves all status colors)
	 */
	static createBackgroundOnly(): ColorIntegrationSystem {
		return new ColorIntegrationSystem({
			useBackgroundHighlighting: true,
			useTextStyling: false,
			preserveStatusColors: true,
		});
	}

	/**
	 * Static factory for simple foreground highlighting (legacy mode)
	 */
	static createForegroundOnly(): ColorIntegrationSystem {
		return new ColorIntegrationSystem({
			useBackgroundHighlighting: false,
			useTextStyling: false,
			preserveStatusColors: false,
		});
	}
}

/**
 * Default color integration system instance
 */
export const defaultColorIntegration =
	ColorIntegrationSystem.createBackgroundOnly();
