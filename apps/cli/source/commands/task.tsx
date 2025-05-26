import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import zod from 'zod';
import { createDatabase, type Store, type Task, type NewTask } from 'astrolabe';

export const options = zod.object({
	action: zod.enum(['list', 'add', 'update', 'remove', 'done']).optional().describe('Task action to perform'),
	id: zod.string().optional().describe('Task ID (required for update, remove, done)'),
	title: zod.string().optional().describe('Task title (required for add)'),
	description: zod.string().optional().describe('Task description'),
	status: zod.string().optional().describe('Task status'),
	parent: zod.string().optional().describe('Parent task ID'),
	help: zod.boolean().default(false).describe('Show help for task command'),
});

type Props = {
	options: zod.infer<typeof options>;
};

function TaskHelp() {
	return (
		<Box flexDirection="column">
			<Text bold>Task Management Commands</Text>
			<Text> </Text>
			<Text bold>Usage:</Text>
			<Text>  astrolabe task [action] [options]</Text>
			<Text> </Text>
			<Text bold>Actions:</Text>
			<Text>  <Text color="green">list</Text>     List all tasks</Text>
			<Text>  <Text color="green">add</Text>      Add a new task</Text>
			<Text>  <Text color="green">update</Text>   Update an existing task</Text>
			<Text>  <Text color="green">remove</Text>   Remove a task</Text>
			<Text>  <Text color="green">done</Text>     Mark a task as completed</Text>
			<Text> </Text>
			<Text bold>Options:</Text>
			<Text>  <Text color="yellow">--id</Text>          Task ID (required for update, remove, done)</Text>
			<Text>  <Text color="yellow">--title</Text>       Task title (required for add)</Text>
			<Text>  <Text color="yellow">--description</Text> Task description</Text>
			<Text>  <Text color="yellow">--status</Text>      Task status</Text>
			<Text>  <Text color="yellow">--parent</Text>      Parent task ID</Text>
			<Text> </Text>
			<Text bold>Examples:</Text>
			<Text>  astrolabe task list</Text>
			<Text>  astrolabe task add --title="Fix bug" --description="Fix login issue"</Text>
			<Text>  astrolabe task done --id="task-123"</Text>
		</Box>
	);
}

function TaskList({ store }: { store: Store }) {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadTasks() {
			try {
				const allTasks = await store.listTasks();
				setTasks(allTasks);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load tasks');
			} finally {
				setLoading(false);
			}
		}
		loadTasks();
	}, [store]);

	if (loading) return <Text>Loading tasks...</Text>;
	if (error) return <Text color="red">Error: {error}</Text>;

	if (tasks.length === 0) {
		return (
			<Box flexDirection="column">
				<Text>No tasks found.</Text>
				<Text>Use <Text color="cyan">astrolabe task add --title="Task name"</Text> to create your first task.</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text bold>Tasks ({tasks.length})</Text>
			<Text> </Text>
			{tasks.map(task => (
				<Box key={task.id} flexDirection="column" marginBottom={1}>
					<Text>
						<Text color="cyan">{task.id}</Text> - <Text bold>{task.title}</Text>
						{task.status && <Text color="yellow"> [{task.status}]</Text>}
					</Text>
					{task.description && (
						<Text color="gray">  {task.description}</Text>
					)}
				</Box>
			))}
		</Box>
	);
}

function AddTask({ store, title, description, parent }: { 
	store: Store; 
	title: string; 
	description?: string; 
	parent?: string; 
}) {
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function createTask() {
			try {
				const newTask: NewTask = {
					title,
					description: description || '',
					status: 'pending',
					parentId: parent,
				};
				
				const task = await store.addTask(newTask);
				setResult(`Task created successfully: ${task.id}`);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to create task');
			}
		}
		createTask();
	}, [store, title, description, parent]);

	if (error) return <Text color="red">Error: {error}</Text>;
	if (result) return <Text color="green">{result}</Text>;
	
	return <Text>Creating task...</Text>;
}

// Component to mark a task as completed
function DoneTask({ store, id }: { store: Store; id: string }) {
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function markDone() {
			try {
				const task = await store.updateTaskStatus(id, 'done');
				if (!task) {
					throw new Error('Task not found');
				}
				setResult(`Task ${id} marked as done ✔️`);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to mark task as done');
			}
		}
		markDone();
	}, [store, id]);

	if (error) return <Text color="red">Error: {error}</Text>;
	if (result) return <Text color="green">{result}</Text>;
	return <Text>Updating task...</Text>;
}

// Component to update task fields
function UpdateTask({ store, id, title, description, status, parent }: {
	store: Store;
	id: string;
	title?: string;
	description?: string;
	status?: string;
	parent?: string;
}) {
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function update() {
			try {
				const updates: Record<string, unknown> = {};
				if (title) updates['title'] = title;
				if (description !== undefined) updates['description'] = description;
				if (status) updates['status'] = status;
				if (parent !== undefined) updates['parentId'] = parent;

				const updated = await store.updateTask(id, updates);
				if (!updated) throw new Error('Task not found or no changes');
				setResult(`Task ${id} updated successfully ✨`);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to update task');
			}
		}
		update();
	}, [store, id, title, description, status, parent]);

	if (error) return <Text color="red">Error: {error}</Text>;
	if (result) return <Text color="green">{result}</Text>;
	return <Text>Updating task...</Text>;
}

// Component to remove a task
function RemoveTask({ store, id }: { store: Store; id: string }) {
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function remove() {
			try {
				const success = await store.deleteTask(id);
				if (!success) throw new Error('Task not found');
				setResult(`Task ${id} removed 🗑️`);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to remove task');
			}
		}
		remove();
	}, [store, id]);

	if (error) return <Text color="red">Error: {error}</Text>;
	if (result) return <Text color="green">{result}</Text>;
	return <Text>Removing task...</Text>;
}

export default function TaskCommand({ options }: Props) {
	const [store, setStore] = useState<Store | null>(null);
	const [dbError, setDbError] = useState<string | null>(null);

	useEffect(() => {
		async function initDb() {
			try {
				const db = await createDatabase({
					verbose: false,
				});
				setStore(db);
			} catch (err) {
				setDbError(err instanceof Error ? err.message : 'Failed to initialize database');
			}
		}
		initDb();
	}, []);

	if (options.help) {
		return <TaskHelp />;
	}

	if (dbError) {
		return <Text color="red">Database Error: {dbError}</Text>;
	}

	if (!store) {
		return <Text>Initializing database...</Text>;
	}

	// Determine action: prefer --action flag, otherwise use first positional argument after "task"
	const argv = process.argv.slice(2); // drop node & script path
	let positionalAction: string | undefined;
	const taskIndex = argv.findIndex((arg) => arg === 'task');
	if (taskIndex !== -1 && argv.length > taskIndex + 1) {
		const candidate = argv[taskIndex + 1] ?? '';
		if (candidate && !candidate.startsWith('-')) {
			positionalAction = candidate;
		}
	}

	const action = options.action ?? positionalAction ?? 'list';

	switch (action) {
		case 'list':
			return <TaskList store={store} />;
		
		case 'add':
			if (!options.title) {
				return <Text color="red">Error: --title is required for adding tasks</Text>;
			}
			return <AddTask 
				store={store} 
				title={options.title} 
				description={options.description}
				parent={options.parent}
			/>;
		
		case 'done':
			if (!options.id) {
				return <Text color="red">Error: --id is required for marking tasks done</Text>;
			}
			return <DoneTask store={store} id={options.id} />;
		
		case 'update':
			if (!options.id) {
				return <Text color="red">Error: --id is required for updating tasks</Text>;
			}
			return (
				<UpdateTask
					store={store}
					id={options.id}
					title={options.title}
					description={options.description}
					status={options.status}
					parent={options.parent}
				/>
			);
		
		case 'remove':
			if (!options.id) {
				return <Text color="red">Error: --id is required for removing tasks</Text>;
			}
			return <RemoveTask store={store} id={options.id} />;
		
		default:
			return (
				<Box flexDirection="column">
					<Text color="red">Unknown action: {action}</Text>
					<Text>Use <Text color="cyan">astrolabe task --help</Text> for available actions.</Text>
				</Box>
			);
	}
} 