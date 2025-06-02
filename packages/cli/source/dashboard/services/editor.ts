import { execFileSync } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Task } from "@astrotask/core";
import type blessed from "blessed";

export interface TaskTemplate {
	title: string;
	description: string;
	details: string;
	priority: "low" | "medium" | "high";
	status: "pending" | "in-progress" | "done" | "cancelled" | "archived";
	tags: string[];
	notes: string;
}

export interface EditorResult {
	success: boolean;
	task?: TaskTemplate;
	error?: string;
}

export interface PendingTaskData {
	task: TaskTemplate;
	parentId: string | null;
}

export interface PendingTaskEditData {
	task: TaskTemplate;
	taskId: string;
}

// Global storage for pending task data that needs to survive screen recreation
let pendingTaskData: PendingTaskData | null = null;

// Global storage for pending task edit data that needs to survive screen recreation
let pendingTaskEditData: PendingTaskEditData | null = null;

export class EditorService {
	private screen: blessed.Widgets.Screen | null = null;

	setScreen(screen: blessed.Widgets.Screen) {
		this.screen = screen;
	}

	// Static method to check and retrieve pending task data
	static getPendingTaskData(): PendingTaskData | null {
		const data = pendingTaskData;
		pendingTaskData = null; // Clear after retrieval
		return data;
	}

	// Static method to check and retrieve pending task edit data
	static getPendingTaskEditData(): PendingTaskEditData | null {
		const data = pendingTaskEditData;
		pendingTaskEditData = null; // Clear after retrieval
		return data;
	}

	private getEditor(): string {
		return process.env["EDITOR"] || process.env["VISUAL"] || "nano";
	}

	private generateTaskTemplate(parentTask?: Task): string {
		const template = `# Task Template
# Lines starting with # are comments and will be ignored
# Fill out the sections below to create your task

# Task Title (required)
title: ${parentTask ? `Subtask of "${parentTask.title}"` : "New Task"}

# Task Description (optional)
description: |
  Brief overview of what this task accomplishes.
  You can use multiple lines here.

# Detailed Implementation Notes (optional)
details: |
  Detailed implementation instructions, acceptance criteria,
  technical notes, or any other relevant information.
  
  Examples:
  - What files need to be modified
  - What functions to implement
  - What tests to write
  - Dependencies or prerequisites

# Priority (low, medium, high)
priority: medium

# Status (pending, in-progress, done, cancelled, archived)
status: pending

# Tags (comma-separated, optional)
tags: 

# Additional Notes (optional)
notes: |
  Any additional context, links, or notes.
`;

		return template;
	}

	private generateTaskEditTemplate(existingTask: Task): string {
		// Convert existing task data to match the template format
		const tagsStr = Array.isArray(existingTask.contextDigest)
			? existingTask.contextDigest.join(", ")
			: "";

		const template = `# Task Template - Editing Existing Task
# Lines starting with # are comments and will be ignored
# Modify the sections below to update your task

# Task Title (required)
title: ${existingTask.title}

# Task Description (optional)
description: |
${
	existingTask.description
		? existingTask.description
				.split("\n")
				.map((line) => `  ${line}`)
				.join("\n")
		: "  Brief overview of what this task accomplishes.\n  You can use multiple lines here."
}

# Detailed Implementation Notes (optional)
details: |
${
	existingTask.prd
		? existingTask.prd
				.split("\n")
				.map((line) => `  ${line}`)
				.join("\n")
		: "  Detailed implementation instructions, acceptance criteria,\n  technical notes, or any other relevant information.\n  \n  Examples:\n  - What files need to be modified\n  - What functions to implement\n  - What tests to write\n  - Dependencies or prerequisites"
}

# Priority (low, medium, high)
priority: ${existingTask.priority}

# Status (pending, in-progress, done, cancelled, archived)
status: ${existingTask.status}

# Tags (comma-separated, optional)
tags: ${tagsStr}

# Additional Notes (optional)
notes: |
  Any additional context, links, or notes.
`;

		return template;
	}

	private parseTaskFromTemplate(content: string): TaskTemplate {
		const task: Partial<TaskTemplate> = {
			tags: [],
		};

		const lines = content.split("\n");
		let currentField: string | null = null;
		let currentValue: string[] = [];

		for (let line of lines) {
			const originalLine = line;
			line = line.trim();

			// Skip comments and empty lines
			if (line.startsWith("#") || line === "") {
				continue;
			}

			// Check for field starts - only if line doesn't start with whitespace (not indented content)
			if (
				line.includes(":") &&
				!originalLine.startsWith(" ") &&
				!originalLine.startsWith("\t")
			) {
				// Save previous field if exists (FIX: save regardless of currentValue length)
				if (currentField) {
					this.setTaskField(task, currentField, currentValue.join("\n").trim());
				}

				const [field, ...valueParts] = line.split(":");
				currentField = field?.trim() || null;

				const value = valueParts.join(":").trim();
				if (value === "|") {
					// Multi-line value starts
					currentValue = [];
				} else if (value) {
					// Single line value
					currentValue = [value];
				} else {
					currentValue = [];
				}
			} else if (currentField) {
				// Continuation of current field
				currentValue.push(line);
			}
		}

		// Save the last field (FIX: This was not properly saving the last field when it had content)
		if (currentField) {
			this.setTaskField(task, currentField, currentValue.join("\n").trim());
		}

		// Validate required fields
		if (!task.title?.trim()) {
			throw new Error("Task title is required");
		}

		// Enhanced validation with user feedback
		const validatedPriority = this.validatePriority(task.priority);
		const validatedStatus = this.validateStatus(task.status);

		// Warn about invalid values
		if (task.priority && !validatedPriority) {
			throw new Error(
				`Invalid priority "${task.priority}". Valid values are: low, medium, high`,
			);
		}
		if (task.status && !validatedStatus) {
			throw new Error(
				`Invalid status "${task.status}". Valid values are: pending, in-progress, done, cancelled, archived`,
			);
		}

		// Set defaults
		return {
			title: task.title.trim(),
			description: task.description?.trim() || "",
			details: task.details?.trim() || "",
			priority: validatedPriority || "medium",
			status: validatedStatus || "pending",
			tags: this.parseTags(task.tags || []),
			notes: task.notes?.trim() || "",
		};
	}

	private setTaskField(
		task: Partial<TaskTemplate>,
		field: string,
		value: string,
	) {
		switch (field.toLowerCase()) {
			case "title":
				task.title = value;
				break;
			case "description":
				task.description = value;
				break;
			case "details":
				task.details = value;
				break;
			case "priority":
				task.priority = value as any;
				break;
			case "status":
				task.status = value as any;
				break;
			case "tags":
				task.tags = typeof value === "string" ? [value] : value;
				break;
			case "notes":
				task.notes = value;
				break;
		}
	}

	private validatePriority(priority: any): "low" | "medium" | "high" | null {
		if (typeof priority === "string") {
			const p = priority.toLowerCase();
			if (["low", "medium", "high"].includes(p)) {
				return p as "low" | "medium" | "high";
			}
		}
		return null;
	}

	private validateStatus(
		status: any,
	): "pending" | "in-progress" | "done" | "cancelled" | "archived" | null {
		if (typeof status === "string") {
			const s = status.toLowerCase();
			if (
				["pending", "in-progress", "done", "cancelled", "archived"].includes(s)
			) {
				return s as
					| "pending"
					| "in-progress"
					| "done"
					| "cancelled"
					| "archived";
			}
		}
		return null;
	}

	private parseTags(tags: string | string[]): string[] {
		if (Array.isArray(tags)) {
			return tags.flatMap((tag) =>
				typeof tag === "string"
					? tag
							.split(",")
							.map((t) => t.trim())
							.filter(Boolean)
					: [],
			);
		}
		if (typeof tags === "string") {
			return tags
				.split(",")
				.map((t) => t.trim())
				.filter(Boolean);
		}
		return [];
	}

	async openEditorForTask(
		parentTask?: Task,
		parentId: string | null = null,
	): Promise<EditorResult> {
		if (!this.screen) {
			return {
				success: false,
				error: "Screen not initialized",
			};
		}

		const tempFile = join(tmpdir(), `astrotask-task-${Date.now()}.md`);

		try {
			// Write template to temp file
			const template = this.generateTaskTemplate(parentTask);
			await fs.writeFile(tempFile, template, "utf8");

			// Get editor command
			const editor = this.getEditor();

			// Parse editor command in case it has arguments
			const [command, ...args] = editor.split(/\s+/);

			if (!command) {
				return {
					success: false,
					error: "No editor command found",
				};
			}

			// Step 1: Detach blessed from the terminal completely
			this.screen.destroy();

			// Step 2: Reset terminal to normal state
			process.stdout.write("\x1b[?1049l"); // Exit alternate screen
			process.stdout.write("\x1b[2J\x1b[H"); // Clear and home
			process.stdout.write("\x1b[?25h"); // Show cursor

			// Step 3: Run editor synchronously - this blocks until editor exits
			try {
				execFileSync(command, [...args, tempFile], {
					stdio: "inherit",
					env: {
						...process.env,
						TERM: process.env["TERM"] || "xterm-256color",
					},
				});
			} catch (error: any) {
				// Editor exited with non-zero code or failed to launch
				const errorMessage =
					error.code === "ENOENT"
						? `Editor '${command}' not found`
						: error.message || "Editor failed";

				// Re-create the screen before returning
				this.recreateScreen();

				return {
					success: false,
					error: errorMessage,
				};
			}

			// Step 4: Read and parse the result
			const content = await fs.readFile(tempFile, "utf8");
			const task = this.parseTaskFromTemplate(content);

			// Step 5: Store the pending task data
			pendingTaskData = {
				task,
				parentId: parentId || null,
			};

			// Step 6: Re-create blessed screen
			this.recreateScreen();

			return {
				success: true,
				task,
			};
		} catch (error) {
			// Make sure to recreate screen on any error
			this.recreateScreen();

			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		} finally {
			// Clean up temp file
			try {
				await fs.unlink(tempFile);
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	async openEditorForTaskEdit(existingTask: Task): Promise<EditorResult> {
		if (!this.screen) {
			return {
				success: false,
				error: "Screen not initialized",
			};
		}

		const tempFile = join(tmpdir(), `astrotask-edit-task-${Date.now()}.md`);

		try {
			// Write template with existing task data to temp file
			const template = this.generateTaskEditTemplate(existingTask);
			await fs.writeFile(tempFile, template, "utf8");

			// Get editor command
			const editor = this.getEditor();

			// Parse editor command in case it has arguments
			const [command, ...args] = editor.split(/\s+/);

			if (!command) {
				return {
					success: false,
					error: "No editor command found",
				};
			}

			// Step 1: Detach blessed from the terminal completely
			this.screen.destroy();

			// Step 2: Reset terminal to normal state
			process.stdout.write("\x1b[?1049l"); // Exit alternate screen
			process.stdout.write("\x1b[2J\x1b[H"); // Clear and home
			process.stdout.write("\x1b[?25h"); // Show cursor

			// Step 3: Run editor synchronously - this blocks until editor exits
			try {
				execFileSync(command, [...args, tempFile], {
					stdio: "inherit",
					env: {
						...process.env,
						TERM: process.env["TERM"] || "xterm-256color",
					},
				});
			} catch (error: any) {
				// Editor exited with non-zero code or failed to launch
				const errorMessage =
					error.code === "ENOENT"
						? `Editor '${command}' not found`
						: error.message || "Editor failed";

				// Re-create the screen before returning
				this.recreateScreen();

				return {
					success: false,
					error: errorMessage,
				};
			}

			// Step 4: Read and parse the result
			const content = await fs.readFile(tempFile, "utf8");
			const task = this.parseTaskFromTemplate(content);

			// Step 5: Store the pending task edit data
			pendingTaskEditData = {
				task,
				taskId: existingTask.id,
			};

			// Step 6: Re-create blessed screen
			this.recreateScreen();

			return {
				success: true,
				task,
			};
		} catch (error) {
			// Make sure to recreate screen on any error
			this.recreateScreen();

			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		} finally {
			// Clean up temp file
			try {
				await fs.unlink(tempFile);
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	private recreateScreen() {
		// Re-enter alternate screen
		process.stdout.write("\x1b[?1049h");

		// The dashboard needs to recreate its screen
		// This is handled by emitting a custom event
		process.emit("blessed-screen-restart" as any);
	}
}
