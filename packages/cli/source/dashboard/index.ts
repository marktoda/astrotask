#!/usr/bin/env node
import { cfg, createDatabase } from "@astrotask/core";
import blessed from "blessed";
import { EditorService } from "./services/editor.js";
import { KeymapService } from "./services/keymap.js";
import { SyncService } from "./services/sync.js";
import { createDashboardStore } from "./store/index.js";
import { DashboardLayout } from "./ui/components/layout.js";

// Suppress terminfo warnings
process.env["NODE_NO_WARNINGS"] = "1";

// Exit the Ink context first
if (process.stdout.isTTY) {
	process.stdout.write("\x1b[?25l"); // Hide cursor
	process.stdout.write("\x1b[2J\x1b[0f"); // Clear screen
}

async function main() {
	try {
		// Set up terminal environment for blessed with Ghostty support
		const originalTerm = process.env["TERM"] || "xterm-256color";
		// Handle Ghostty terminal by falling back to xterm-256color
		if (originalTerm.includes("ghostty")) {
			process.env["TERM"] = "xterm-256color";
		} else {
			process.env["TERM"] = originalTerm;
		}

		// Use the centralized configuration system
		const dbOptions = {
			dataDir: cfg.DATABASE_URI,
			verbose: cfg.DB_VERBOSE,
			enableLocking: true,
			lockOptions: {
				processType: "cli-dashboard", // Identify this as CLI dashboard process
			},
		};
		const db = await createDatabase(dbOptions);

		// Function to create and initialize the dashboard
		async function createDashboard() {
			// Create blessed screen with proper configuration for robust key handling
			const screen = blessed.screen({
				smartCSR: true,
				title: "Astrolabe Dashboard",
				fullUnicode: true,
				dockBorders: true,
				cursor: {
					artificial: true,
					shape: "block",
					blink: true,
					color: "white",
				},
				sendFocus: true, // Ensure focus events are sent
				warnings: false, // Disable warnings to suppress terminfo messages
				terminal: process.env["TERM"], // Use the terminal we set above
				forceUnicode: true, // Force unicode support
				// Allow these keys to bubble up and not be locked by child widgets
				ignoreLocked: ["C-c", "tab", "S-tab", "btab", ":", "?", "q"],
			} as any);

			// Create store and pass the screen
			const useStore = createDashboardStore(db, screen);
			const store = useStore.getState();

			// Turn on application-cursor & raw input explicitly for better key handling
			// Check if methods exist before calling them
			try {
				if (
					screen.program &&
					typeof (screen.program as any).keypad === "function"
				) {
					(screen.program as any).keypad(true);
				}
				if (typeof (screen as any).grabInput === "function") {
					(screen as any).grabInput({ mouse: true });
				}
			} catch (programError: any) {
				// Ignore program setup errors - not critical for basic functionality
				console.warn(
					"Warning: Could not enable enhanced input mode:",
					programError.message,
				);
			}

			// Debug key handling (enable with DEBUG_KEYS=1)
			if (process.env["DEBUG_KEYS"]) {
				screen.on("keypress", (_ch, key) => {
					console.error(
						`DEBUG: Key pressed - full: "${key.full}", sequence: ${JSON.stringify(key.sequence)}, name: "${key.name}"`,
					);
				});
			}

			// Initialize services
			const keymapService = new KeymapService();
			const syncService = new SyncService(useStore);

			// Create main layout
			const layout = new DashboardLayout(screen, useStore, keymapService);

			// Start sync service
			syncService.start();

			// Initialize layout
			await layout.initialize();

			// Check for pending task data from editor
			const pendingTaskData = EditorService.getPendingTaskData();
			if (pendingTaskData) {
				// Process the pending task after a short delay to ensure UI is ready
				setTimeout(async () => {
					await store.processPendingTask(pendingTaskData);
				}, 200);
			}

			// Check for pending task edit data from editor
			const pendingTaskEditData = EditorService.getPendingTaskEditData();
			if (pendingTaskEditData) {
				// Process the pending task edit after a short delay to ensure UI is ready
				setTimeout(async () => {
					await store.processPendingTaskEdit(pendingTaskEditData);
				}, 200);
			}

			// Cleanup function
			async function cleanup(exitProcess = true) {
				try {
					// Save changes before exit
					await store.flushOnExit();
				} catch (error) {
					console.error("Failed to save before exit:", error);
				}

				try {
					syncService.stop();
					screen.destroy();
					if (process.stdout.isTTY) {
						process.stdout.write("\x1b[?25h"); // Show cursor
					}
				} catch (error) {
					// Ignore cleanup errors
				}

				if (exitProcess) {
					process.exit(0);
				}
			}

			// Set up robust exit handling with multiple key combinations
			screen.key(["q", "C-c", "escape"], async () => {
				// Check if any overlays are open first
				const currentState = store;
				if (currentState.commandPaletteOpen || currentState.helpOverlayOpen) {
					// Close overlays instead of exiting
					currentState.toggleCommandPalette();
					currentState.toggleHelpOverlay();
					return;
				}

				// Double-tap safety for exit
				if (currentState.confirmExit) {
					await cleanup();
				} else {
					currentState.setConfirmExit(true);
					currentState.setStatusMessage("Press q/Ctrl+C again to exit");
					setTimeout(() => currentState.setConfirmExit(false), 2000);
				}
			});

			// Force exit with Ctrl+C (bypass double-tap)
			screen.key(["C-c"], async () => {
				await cleanup();
			});

			// Handle terminal resize
			screen.on("resize", () => {
				layout.handleResize();
			});

			// Render initial state
			screen.render();

			return { screen, cleanup };
		}

		// Create initial dashboard
		let currentDashboard = await createDashboard();

		// Handle screen restart after editor closes
		process.on("blessed-screen-restart" as any, async () => {
			// Clean up current screen without exiting
			await currentDashboard.cleanup(false);

			// Small delay to ensure terminal is ready
			setTimeout(async () => {
				// Recreate the dashboard
				currentDashboard = await createDashboard();
			}, 100);
		});

		// Set up process signal handlers
		process.on("SIGINT", () => currentDashboard.cleanup());
		process.on("SIGTERM", () => currentDashboard.cleanup());
		process.on("beforeExit", () => currentDashboard.cleanup());

		// Handle uncaught exceptions gracefully
		process.on("uncaughtException", (error) => {
			console.error("Uncaught exception:", error);
			currentDashboard.cleanup();
		});

		process.on("unhandledRejection", (reason) => {
			console.error("Unhandled rejection:", reason);
			currentDashboard.cleanup();
		});
	} catch (error) {
		console.error("Failed to initialize dashboard:", error);
		process.exit(1);
	}
}

main();
