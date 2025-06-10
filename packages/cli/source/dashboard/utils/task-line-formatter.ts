/**
 * @fileoverview Task Line Formatter for Astrolabe TUI
 *
 * Implements the enhanced task-line layout as specified in the design doc.
 * Provides consistent formatting with proper spacing and column alignment.
 *
 * Design Doc Layout:
 * ┌ idx ┐┌ fold ┐┌ glyph │ title…                              │
 *  12     ▸       ⛔    Refactor DB schema @due:6/30
 *
 * @module dashboard/utils/task-line-formatter
 * @since 1.0.0
 */

import type { Task } from "@astrotask/core";
import { StatusRenderer } from "./status-renderer.js";

/**
 * Configuration for task line formatting
 */
export interface TaskLineConfig {
	/** Width for the index column (default: 3) */
	indexWidth: number;
	/** Width for the fold indicator column (default: 2) */
	foldWidth: number;
	/** Width for the status glyph column (default: 2) */
	glyphWidth: number;
	/** Whether to show line numbers/indices (default: true) */
	showIndex: boolean;
	/** Whether to dim fold triangles to avoid clash with status colors (default: true) */
	dimFoldTriangles: boolean;
	/** Status renderer instance to use */
	statusRenderer: StatusRenderer;
}

/**
 * Information about a task in the tree for formatting
 */
export interface TaskLineInfo {
	/** The task to format */
	task: Task;
	/** Display index/line number (1-based) */
	index: number;
	/** Tree depth level */
	depth: number;
	/** Whether task has children */
	hasChildren: boolean;
	/** Whether children are expanded */
	isExpanded: boolean;
	/** Priority indicator string (if any) */
	priorityIndicator?: string;
	/** Dependency indicator string (if any) */
	dependencyIndicator?: string;
}

/**
 * Result of task line formatting
 */
export interface FormattedTaskLine {
	/** The complete formatted line */
	fullLine: string;
	/** Individual column values for debugging */
	columns: {
		index: string;
		fold: string;
		glyph: string;
		title: string;
	};
	/** Total width of the formatted line */
	width: number;
}

/**
 * Task line formatter implementing the enhanced design doc layout
 */
export class TaskLineFormatter {
	private config: TaskLineConfig;

	constructor(config: Partial<TaskLineConfig> = {}) {
		this.config = {
			indexWidth: 3,
			foldWidth: 2,
			glyphWidth: 2,
			showIndex: true,
			dimFoldTriangles: true,
			statusRenderer: StatusRenderer.create(),
			...config,
		};
	}

	/**
	 * Format a single task line according to the design doc layout
	 */
	formatTaskLine(info: TaskLineInfo): FormattedTaskLine {
		const { task, index, depth, hasChildren, isExpanded } = info;

		// Build each column
		const indexCol = this.formatIndexColumn(index);
		const foldCol = this.formatFoldColumn(hasChildren, isExpanded, depth);
		const glyphCol = this.formatGlyphColumn(task.status);
		const titleCol = this.formatTitleColumn(task, info);

		// Combine columns with proper spacing - add space between fold and glyph
		const fullLine = `${indexCol} ${foldCol} ${glyphCol}${titleCol}`;

		return {
			fullLine,
			columns: {
				index: indexCol,
				fold: foldCol,
				glyph: glyphCol,
				title: titleCol,
			},
			width: fullLine.length,
		};
	}

	/**
	 * Format the index column with right-alignment
	 */
	private formatIndexColumn(index: number): string {
		if (!this.config.showIndex) {
			return " ".repeat(this.config.indexWidth);
		}

		const indexStr = index.toString();
		return indexStr.padStart(this.config.indexWidth, " ");
	}

	/**
	 * Format the fold indicator column with indentation
	 */
	private formatFoldColumn(
		hasChildren: boolean,
		isExpanded: boolean,
		depth: number,
	): string {
		// Apply indentation based on depth
		const indent = "  ".repeat(depth);

		// Create the fold indicator with larger, more visible arrows
		let foldIndicator = " ";
		if (hasChildren) {
			foldIndicator = isExpanded ? "▼" : "▶";
		}

		// Apply dim styling if configured (blessed.js format)
		const styledIndicator =
			this.config.dimFoldTriangles && hasChildren
				? `{gray-fg}${foldIndicator}{/gray-fg}`
				: foldIndicator;

		// Return indentation + fold indicator
		return `${indent}${styledIndicator}`;
	}

	/**
	 * Format the status glyph column with enhanced rendering
	 */
	private formatGlyphColumn(status: Task["status"]): string {
		const renderedGlyph = this.config.statusRenderer.renderStatus(status);

		// The rendered glyph includes color tags, so we need to account for that in width calculation
		// For now, we'll use a fixed width and pad with spaces
		const plainGlyph = this.config.statusRenderer.renderStatusPlain(status);
		const padding = Math.max(0, this.config.glyphWidth - plainGlyph.length);

		return `${renderedGlyph}${" ".repeat(padding)}`;
	}

	/**
	 * Format the title column with additional indicators (no indentation here)
	 */
	private formatTitleColumn(task: Task, info: TaskLineInfo): string {
		// No indentation in title - it's handled in fold column
		let title = task.title;

		// Add priority indicator if present
		if (info.priorityIndicator) {
			title += info.priorityIndicator;
		}

		// Add dependency indicator if present
		if (info.dependencyIndicator) {
			title += info.dependencyIndicator;
		}

		// Add description preview if available and short enough
		if (task.description && task.description.length < 50) {
			title += ` {gray-fg}(${task.description}){/gray-fg}`;
		}

		return title;
	}

	/**
	 * Create a header line showing column boundaries (for debugging)
	 */
	formatHeaderLine(): string {
		const indexHeader = "idx".padStart(this.config.indexWidth, " ");
		const foldHeader = "fold".padEnd(this.config.foldWidth, " ");
		const glyphHeader = "glyph".padEnd(this.config.glyphWidth, " ");
		const titleHeader = "title";

		return `${indexHeader} │ ${foldHeader} │ ${glyphHeader} │ ${titleHeader}`;
	}

	/**
	 * Create a separator line showing column boundaries (for debugging)
	 */
	formatSeparatorLine(): string {
		const indexSep = "─".repeat(this.config.indexWidth);
		const foldSep = "─".repeat(this.config.foldWidth);
		const glyphSep = "─".repeat(this.config.glyphWidth);
		const titleSep = "─".repeat(20); // Arbitrary title width for separator

		return `${indexSep}─┼─${foldSep}─┼─${glyphSep}─┼─${titleSep}`;
	}

	/**
	 * Format multiple task lines with consistent formatting
	 */
	formatTaskLines(taskInfos: TaskLineInfo[]): FormattedTaskLine[] {
		return taskInfos.map((info) => this.formatTaskLine(info));
	}

	/**
	 * Get the current configuration
	 */
	getConfig(): TaskLineConfig {
		return { ...this.config };
	}

	/**
	 * Create a new formatter with updated configuration
	 */
	withConfig(updates: Partial<TaskLineConfig>): TaskLineFormatter {
		return new TaskLineFormatter({ ...this.config, ...updates });
	}

	/**
	 * Static factory method for default formatter
	 */
	static create(config?: Partial<TaskLineConfig>): TaskLineFormatter {
		return new TaskLineFormatter(config);
	}

	/**
	 * Static factory method for compact formatter (smaller columns)
	 */
	static createCompact(): TaskLineFormatter {
		return new TaskLineFormatter({
			indexWidth: 2,
			foldWidth: 1,
			glyphWidth: 2,
			showIndex: true,
		});
	}

	/**
	 * Static factory method for wide formatter (larger columns)
	 */
	static createWide(): TaskLineFormatter {
		return new TaskLineFormatter({
			indexWidth: 4,
			foldWidth: 3,
			glyphWidth: 4,
			showIndex: true,
		});
	}
}

/**
 * Default task line formatter instance
 */
export const defaultTaskLineFormatter = TaskLineFormatter.create();
