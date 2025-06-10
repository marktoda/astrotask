import { describe, it, expect, beforeEach } from "vitest";
import { EditorService, type TaskTemplate } from "../../source/dashboard/services/editor.js";

describe("EditorService", () => {
	let editorService: EditorService;

	beforeEach(() => {
		editorService = new EditorService();
	});

	describe("parseTaskFromTemplate", () => {
		it("should parse a simple task template", () => {
			const template = `# Task Template
# Lines starting with # are comments and will be ignored

title: Test Task
description: A test task description
priorityscore: 80
status: pending
tags: test, demo
`;

			// Access the private method via reflection for testing
			const parseMethod = (editorService as any).parseTaskFromTemplate.bind(editorService);
			const result: TaskTemplate = parseMethod(template);

			expect(result.title).toBe("Test Task");
			expect(result.description).toBe("A test task description");
			expect(result.priorityScore).toBe(80);
			expect(result.status).toBe("pending");
			expect(result.tags).toEqual(["test", "demo"]);
			expect(result.details).toBe("");
			expect(result.notes).toBe("");
		});

		it("should parse multi-line fields", () => {
			const template = `title: Multi-line Task
description: |
  This is a multi-line
  description with
  multiple lines
details: |
  Implementation details:
  - Step 1
  - Step 2
priorityscore: 50
`;

			const parseMethod = (editorService as any).parseTaskFromTemplate.bind(editorService);
			const result: TaskTemplate = parseMethod(template);

			expect(result.title).toBe("Multi-line Task");
			expect(result.description).toBe("This is a multi-line\ndescription with\nmultiple lines");
			expect(result.details).toBe("Implementation details:\n- Step 1\n- Step 2");
			expect(result.priorityScore).toBe(50);
		});

		it("should throw error if title is missing", () => {
			const template = `description: No title task
priorityscore: 80
`;

			const parseMethod = (editorService as any).parseTaskFromTemplate.bind(editorService);
			expect(() => parseMethod(template)).toThrow("Task title is required");
		});

		it("should handle empty fields gracefully", () => {
			const template = `title: Empty Fields Task
description: 
details: 
tags:
notes:
`;

			const parseMethod = (editorService as any).parseTaskFromTemplate.bind(editorService);
			const result: TaskTemplate = parseMethod(template);

			expect(result.title).toBe("Empty Fields Task");
			expect(result.description).toBe("");
			expect(result.details).toBe("");
			expect(result.tags).toEqual([]);
			expect(result.notes).toBe("");
		});

		it("should ignore comments and empty lines", () => {
			const template = `# This is a comment
# Another comment

title: Task with Comments

# Comment in the middle
description: Task description
# More comments

priorityscore: 20
# Final comment
`;

			const parseMethod = (editorService as any).parseTaskFromTemplate.bind(editorService);
			const result: TaskTemplate = parseMethod(template);

			expect(result.title).toBe("Task with Comments");
			expect(result.description).toBe("Task description");
			expect(result.priorityScore).toBe(20);
		});

		it("should throw error for invalid priority values", () => {
			const template = `title: Test Task
priorityscore: 150
`;

			const parseMethod = (editorService as any).parseTaskFromTemplate.bind(editorService);
			expect(() => parseMethod(template)).toThrow('Invalid priority score "150". Must be a number between 0 and 100');
		});

		it("should throw error for invalid status values", () => {
			const template = `title: Test Task
status: todo
`;

			const parseMethod = (editorService as any).parseTaskFromTemplate.bind(editorService);
			expect(() => parseMethod(template)).toThrow('Invalid status "todo". Valid values are: pending, in-progress, done, cancelled, archived');
		});

		it("should handle valid priority and status values", () => {
			const template = `title: Test Task
priorityscore: 80
status: in-progress
`;

			const parseMethod = (editorService as any).parseTaskFromTemplate.bind(editorService);
			const result: TaskTemplate = parseMethod(template);

			expect(result.title).toBe("Test Task");
			expect(result.priorityScore).toBe(80);
			expect(result.status).toBe("in-progress");
		});
	});
}); 