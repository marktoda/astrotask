import { spawn } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Task } from "@astrolabe/core";
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

export class EditorService {
	private screen: blessed.Widgets.Screen | null = null;

	setScreen(screen: blessed.Widgets.Screen) {
		this.screen = screen;
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

	private parseTaskFromTemplate(content: string): TaskTemplate {
		const task: Partial<TaskTemplate> = {
			tags: [],
		};

		const lines = content.split('\n');
		let currentField: string | null = null;
		let currentValue: string[] = [];

		for (let line of lines) {
			line = line.trim();
			
			// Skip comments and empty lines
			if (line.startsWith('#') || line === '') {
				continue;
			}

			// Check for field starts
			if (line.includes(':')) {
				// Save previous field if exists
				if (currentField && currentValue.length > 0) {
					this.setTaskField(task, currentField, currentValue.join('\n').trim());
				}

				const [field, ...valueParts] = line.split(':');
				currentField = field?.trim() || null;
				
				const value = valueParts.join(':').trim();
				if (value === '|') {
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

		// Save the last field
		if (currentField && currentValue.length > 0) {
			this.setTaskField(task, currentField, currentValue.join('\n').trim());
		}

		// Validate required fields
		if (!task.title?.trim()) {
			throw new Error("Task title is required");
		}

		// Set defaults
		return {
			title: task.title.trim(),
			description: task.description?.trim() || "",
			details: task.details?.trim() || "",
			priority: this.validatePriority(task.priority) || "medium",
			status: this.validateStatus(task.status) || "pending",
			tags: this.parseTags(task.tags || []),
			notes: task.notes?.trim() || "",
		};
	}

	private setTaskField(task: Partial<TaskTemplate>, field: string, value: string) {
		switch (field.toLowerCase()) {
			case 'title':
				task.title = value;
				break;
			case 'description':
				task.description = value;
				break;
			case 'details':
				task.details = value;
				break;
			case 'priority':
				task.priority = value as any;
				break;
			case 'status':
				task.status = value as any;
				break;
			case 'tags':
				task.tags = typeof value === 'string' ? [value] : value;
				break;
			case 'notes':
				task.notes = value;
				break;
		}
	}

	private validatePriority(priority: any): "low" | "medium" | "high" | null {
		if (typeof priority === 'string') {
			const p = priority.toLowerCase();
			if (['low', 'medium', 'high'].includes(p)) {
				return p as "low" | "medium" | "high";
			}
		}
		return null;
	}

	private validateStatus(status: any): "pending" | "in-progress" | "done" | "cancelled" | "archived" | null {
		if (typeof status === 'string') {
			const s = status.toLowerCase();
			if (['pending', 'in-progress', 'done', 'cancelled', 'archived'].includes(s)) {
				return s as "pending" | "in-progress" | "done" | "cancelled" | "archived";
			}
		}
		return null;
	}

	private parseTags(tags: string | string[]): string[] {
		if (Array.isArray(tags)) {
			return tags.flatMap(tag => 
				typeof tag === 'string' 
					? tag.split(',').map(t => t.trim()).filter(Boolean)
					: []
			);
		}
		if (typeof tags === 'string') {
			return tags.split(',').map(t => t.trim()).filter(Boolean);
		}
		return [];
	}

	async openEditorForTask(parentTask?: Task): Promise<EditorResult> {
		if (!this.screen) {
			return {
				success: false,
				error: "Screen not initialized",
			};
		}

		const tempFile = join(tmpdir(), `astrolabe-task-${Date.now()}.md`);
		
		try {
			// Write template to temp file
			const template = this.generateTaskTemplate(parentTask);
			await fs.writeFile(tempFile, template, 'utf8');

			// Get editor command
			const editor = this.getEditor();
			
			// Use screen.exec which is more reliable than spawn
			const result = await this.execEditor(editor, tempFile);

			if (!result.success) {
				return result;
			}

			// Read and parse the result
			const content = await fs.readFile(tempFile, 'utf8');
			const task = this.parseTaskFromTemplate(content);

			return {
				success: true,
				task,
			};
		} catch (error) {
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

	private execEditor(editor: string, filename: string): Promise<EditorResult> {
		return new Promise((resolve) => {
			const screen = this.screen!;
			
			// Disable screen rendering during editor session
			const originalRender = screen.render.bind(screen);
			screen.render = () => {};
			
			// Get the program instance
			const program = screen.program as any;
			
			// Completely reset terminal state for the editor
			try {
				// Save current state
				program.saveCursor();
				program.savedCursor = true;
				
				// Exit alternate buffer and show cursor
				program.normalBuffer();
				program.showCursor();
				program.csr(0, program.rows - 1);
				program.disableMouse();
				
				// Reset all terminal modes
				if (program.term) {
					program.term.out('\x1b[?1049l'); // Exit alternate screen
					program.term.out('\x1b[?25h');   // Show cursor
					program.term.out('\x1b[?1000l'); // Disable mouse
					program.term.out('\x1b[?1002l'); // Disable mouse tracking
					program.term.out('\x1b[?1003l'); // Disable any mouse mode
					program.term.out('\x1b[?1006l'); // Disable SGR mouse mode
					program.term.out('\x1b[?47l');   // Use normal screen buffer
					program.term.out('\x1b[2J');     // Clear screen
					program.term.out('\x1b[H');      // Move to home
				}
				
				// Flush any pending output
				if (program.output && typeof program.output.flush === 'function') {
					program.output.flush();
				}
			} catch (err) {
				// Continue even if some reset operations fail
			}
			
			// Parse editor command in case it has arguments
			const [command, ...args] = editor.split(/\s+/);
			
			if (!command) {
				// Restore render function
				screen.render = originalRender;
				resolve({ 
					success: false, 
					error: "No editor command found" 
				});
				return;
			}

			// Give terminal time to settle before spawning editor
			setTimeout(() => {
				// Spawn the editor with a completely clean environment
				const child = spawn(command, [...args, filename], {
					stdio: 'inherit',
					shell: true,
					env: {
						...process.env,
						// Ensure terminal type is set correctly for neovim
						TERM: process.env['TERM'] || 'xterm-256color',
						// Clear any blessed-specific environment variables
						BLESSED: undefined,
						BLESSED_SCREEN: undefined,
					}
				});

				const cleanup = () => {
					// Re-enter blessed mode
					try {
						// Clear screen first
						if (program.term) {
							program.term.out('\x1b[2J');     // Clear screen
							program.term.out('\x1b[H');      // Move to home
						}
						
						// Re-enter alternate buffer
						program.alternateBuffer();
						program.csr(0, program.rows - 1);
						program.hideCursor();
						program.enableMouse();
						
						// Restore saved cursor if it was saved
						if (program.savedCursor) {
							program.restoreCursor();
							program.savedCursor = false;
						}
						
						// Re-enable mouse modes for blessed
						if (program.term) {
							program.term.out('\x1b[?1049h'); // Enter alternate screen
							program.term.out('\x1b[?25l');   // Hide cursor
							program.term.out('\x1b[?1000h'); // Enable mouse
							program.term.out('\x1b[?1002h'); // Enable mouse tracking
							program.term.out('\x1b[?1003h'); // Enable any mouse mode
							program.term.out('\x1b[?1006h'); // Enable SGR mouse mode
						}
						
						// Flush output
						if (program.output && typeof program.output.flush === 'function') {
							program.output.flush();
						}
					} catch (err) {
						// Continue even if restoration fails
					}
					
					// Restore render function
					screen.render = originalRender;
					
					// Force a full screen redraw
					screen.alloc();
					screen.render();
				};

				child.on('exit', (code: number | null) => {
					cleanup();
					
					if (code === 0) {
						resolve({ success: true });
					} else {
						resolve({ 
							success: false, 
							error: `Editor exited with code ${code}` 
						});
					}
				});

				child.on('error', (error: Error) => {
					cleanup();
					
					resolve({ 
						success: false, 
						error: `Failed to start editor: ${error.message}` 
					});
				});
			}, 50); // Small delay to ensure terminal has settled
		});
	}
} 