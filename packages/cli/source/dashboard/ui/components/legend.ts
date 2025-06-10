import blessed from "blessed";
import type { StoreApi } from "zustand";
import type { DashboardStore } from "../../store/index.js";

export class Legend {
	private box: blessed.Widgets.BoxElement;
	private unsubscribe: () => void;

	constructor(
		private parent: blessed.Widgets.Node,
		private store: StoreApi<DashboardStore>,
	) {
		// Create the legend box
		this.box = blessed.box({
			parent: this.parent,
			border: {
				type: "line",
			},
			style: {
				border: {
					fg: "cyan",
				},
			},
			tags: true,
		});

		// Subscribe to store updates
		this.unsubscribe = this.store.subscribe((state) => {
			this.render(state);
		});

		// Initial render
		this.render(this.store.getState());
	}

	private render(state: DashboardStore) {
		const { treeViewMode } = state;

		const lines: string[] = [];

		// Status legend with updated glyphs
		lines.push(
			"{bold}Status:{/bold} {gray-fg}○{/gray-fg} Pending │ {yellow-fg}●{/yellow-fg} In progress │ {red-fg}⛔{/red-fg} Blocked │ {green-fg}✓{/green-fg} Done │ {bold}View:{/bold} " +
				(treeViewMode === "hierarchy" ? "Tree" : "Dependencies"),
		);

		// Dependency legend
		lines.push(
			"{bold}Dependencies:{/bold}  {yellow-fg}⚠{/yellow-fg} Blocking (pending)  │  {green-fg}✓{/green-fg} Blocking (done)  │  {cyan-fg}←{/cyan-fg} Dependent  │  {magenta-fg}~{/magenta-fg} Related",
		);

		// Join lines with newlines
		const content = lines.join("\n");
		this.box.setContent(content);

		// Force render
		this.box.screen.render();
	}

	setPosition(position: blessed.Widgets.Position) {
		Object.assign(this.box, position);
	}

	destroy() {
		this.unsubscribe();
		this.box.destroy();
	}
}
