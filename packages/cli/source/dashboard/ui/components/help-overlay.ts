import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";

interface KeyBinding {
	keys: string[];
	description: string;
	priority?: "essential" | "common" | "advanced"; // Priority level for the binding
}

interface Section {
	title: string;
	bindings: KeyBinding[];
	description?: string; // Optional section description
	category: "essential" | "navigation" | "operations" | "advanced"; // Section category
}

export class HelpOverlay {
	private box: blessed.Widgets.BoxElement;
	private content: blessed.Widgets.TextElement;
	private unsubscribe: () => void;
	private allSections: Section[] = [];

	constructor(
		private parent: blessed.Widgets.Node,
		private store: StoreApi<DashboardStore>,
	) {
		// Create the overlay box with full coverage
		this.box = blessed.box({
			parent: this.parent,
			top: 2,
			left: 2,
			right: 2,
			bottom: 2,
			border: {
				type: "line",
			},
			style: {
				border: {
					fg: "cyan",
				},
				bg: "black",
				fg: "white",
			},
			label: " Help - Key Bindings ",
			hidden: true,
		});

		// Create scrollable content with better padding
		this.content = blessed.text({
			parent: this.box,
			top: 0,
			left: 1,
			right: 1,
			bottom: 0,
			scrollable: true,
			keys: true,
			mouse: true,
			content: "",
			style: {
				bg: "black",
				fg: "white",
			},
		});

		// Initialize sections data
		this.initializeSections();
		this.setContent();

		// Simple key handlers - just escape to close
		this.box.key(["escape", "q", "?"], () => {
			this.store.getState().toggleHelpOverlay();
		});

		// Subscribe to store updates
		this.unsubscribe = this.store.subscribe((state) => {
			if (state.helpOverlayOpen && this.box.hidden) {
				this.show();
			} else if (!state.helpOverlayOpen && !this.box.hidden) {
				this.hide();
			}
		});
	}

	private initializeSections() {
		this.allSections = [
			{
				title: "Essential Commands",
				description: "Must-know shortcuts for daily use",
				category: "essential" as const,
				bindings: [
					{
						keys: ["?"],
						description: "Show/hide this help",
						priority: "essential" as const,
					},
					{
						keys: ["q", "Ctrl+c"],
						description: "Quit application (double tap)",
						priority: "essential" as const,
					},
					{
						keys: [":"],
						description: "Open command palette",
						priority: "essential" as const,
					},
					{
						keys: ["Tab"],
						description: "Focus next panel",
						priority: "essential" as const,
					},
					{
						keys: ["Shift+Tab"],
						description: "Focus previous panel",
						priority: "essential" as const,
					},
				],
			},
			{
				title: "Navigation & Movement",
				description: "Move around the interface efficiently",
				category: "navigation" as const,
				bindings: [
					{
						keys: ["↑", "k"],
						description: "Move cursor up",
						priority: "essential" as const,
					},
					{
						keys: ["↓", "j"],
						description: "Move cursor down",
						priority: "essential" as const,
					},
					{
						keys: ["←", "h"],
						description: "Collapse node / Move left",
						priority: "common" as const,
					},
					{
						keys: ["→", "l"],
						description: "Expand node / Move right",
						priority: "common" as const,
					},
					{
						keys: ["g"],
						description: "Go to top",
						priority: "common" as const,
					},
					{
						keys: ["G"],
						description: "Go to bottom",
						priority: "common" as const,
					},
				],
			},
			{
				title: "Task Operations",
				description: "Create, edit, and manage tasks",
				category: "operations" as const,
				bindings: [
					{
						keys: ["Enter", "Space"],
						description: "Toggle task completion",
						priority: "essential" as const,
					},
					{
						keys: ["a"],
						description: "Add sibling task with editor",
						priority: "essential" as const,
					},
					{
						keys: ["A"],
						description: "Add child task with editor",
						priority: "essential" as const,
					},
					{
						keys: ["r"],
						description: "Rename task",
						priority: "common" as const,
					},
					{
						keys: ["e"],
						description: "Edit task with editor",
						priority: "common" as const,
					},
					{
						keys: ["D"],
						description: "Delete task (with confirmation)",
						priority: "common" as const,
					},
					{
						keys: ["c"],
						description: "Toggle completed tasks visibility",
						priority: "common" as const,
					},
				],
			},
		];
	}

	private setContent() {
		const lines: string[] = [];

		// Header with simpler formatting
		lines.push("Astrolabe Terminal UI - Keyboard Shortcuts");
		lines.push("");
		lines.push("Press ? or q to close");
		lines.push("Priority: * Essential • + Common • > Advanced");
		lines.push("");

		// Group sections by category for better organization
		const categorizedSections = this.groupSectionsByCategory();
		
		for (const [category, sections] of categorizedSections) {
			if (sections.length > 0) {
				// Category header - simplified
				const categoryTitle = this.getCategoryTitle(category);
				lines.push(categoryTitle);
				lines.push("═".repeat(60));
				lines.push("");

				sections.forEach((section) => {
					lines.push(section.title);
					
					// Add section description if available
					if (section.description) {
						lines.push(`  ${section.description}`);
					}
					lines.push("─".repeat(50));

					// Sort bindings by priority
					const sortedBindings = this.sortBindingsByPriority(section.bindings);

					sortedBindings.forEach((binding) => {
						const keys = binding.keys.join(", ");
						const description = binding.description;
						const priorityIcon = this.getPriorityIcon(binding.priority);
						const padding = 25 - keys.length;
						
						// Simplified formatting without blessed tags
						lines.push(
							`  ${priorityIcon} ${keys}${" ".repeat(Math.max(0, padding))}${description}`,
						);
					});

					lines.push("");
				});
			}
		}

		// Footer
		lines.push("");
		lines.push("═".repeat(60));
		lines.push("Tip: Use vim-style navigation (hjkl) throughout the interface");

		this.content.setContent(lines.join("\n"));
	}

	private groupSectionsByCategory(): Map<string, Section[]> {
		const grouped = new Map<string, Section[]>();
		
		// Define category order for consistent display
		const categoryOrder = ["essential", "navigation", "operations", "advanced"];
		
		// Initialize all categories
		categoryOrder.forEach(category => {
			grouped.set(category, []);
		});
		
		// Group sections by category
		this.allSections.forEach(section => {
			const category = section.category;
			if (!grouped.has(category)) {
				grouped.set(category, []);
			}
			grouped.get(category)!.push(section);
		});
		
		// Return only categories that have sections
		const result = new Map<string, Section[]>();
		for (const [category, sections] of grouped) {
			if (sections.length > 0) {
				result.set(category, sections);
			}
		}
		
		return result;
	}

	private getCategoryTitle(category: string): string {
		const categoryTitles: Record<string, string> = {
			essential: "* ESSENTIAL - Start Here",
			navigation: "* NAVIGATION - Moving Around", 
			operations: "* OPERATIONS - Getting Things Done",
			advanced: "* ADVANCED - Power User Features"
		};
		
		return categoryTitles[category] || category.toUpperCase();
	}

	private sortBindingsByPriority(bindings: KeyBinding[]): KeyBinding[] {
		const priorityOrder = { essential: 0, common: 1, advanced: 2 };
		
		return [...bindings].sort((a, b) => {
			const aPriority = priorityOrder[a.priority || "common"];
			const bPriority = priorityOrder[b.priority || "common"];
			return aPriority - bPriority;
		});
	}

	private getPriorityIcon(priority?: "essential" | "common" | "advanced"): string {
		const icons = {
			essential: "*",
			common: "+",
			advanced: ">"
		};
		
		return icons[priority || "common"];
	}

	show() {
		this.box.show();
		this.content.focus();
		this.box.screen.render();
	}

	hide() {
		this.box.hide();
		// Return focus to the main dashboard
		if (this.parent && 'focus' in this.parent) {
			(this.parent as any).focus();
		}
		this.box.screen.render();
	}

	focus() {
		this.content.focus();
	}

	destroy() {
		this.unsubscribe();
		this.box.destroy();
	}
}
