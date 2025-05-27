import type { Project, Task } from "@astrolabe/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { useDatabase } from "../context/DatabaseContext.js";

export const description = "Dashboard - Project overview and status";

interface DashboardData {
	projects: Project[];
	allTasks: Task[];
	rootTasks: Task[];
	recentTasks: Task[];
}

interface TaskStats {
	total: number;
	pending: number;
	inProgress: number;
	done: number;
	cancelled: number;
	completionRate: number;
}

export default function Dashboard() {
	const db = useDatabase();
	const [data, setData] = useState<DashboardData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadDashboardData() {
			try {
				const [projects, allTasks, rootTasks] = await Promise.all([
					db.listProjects(),
					db.listTasks(),
					db.listTasks({ parentId: null }),
				]);

				// Get recent tasks (last 10, sorted by updated date)
				const recentTasks = [...allTasks]
					.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
					.slice(0, 10);

				setData({
					projects,
					allTasks,
					rootTasks,
					recentTasks,
				});
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load dashboard data");
			} finally {
				setLoading(false);
			}
		}
		loadDashboardData();
	}, [db]);

	if (loading) return <Text>Loading dashboard...</Text>;
	if (error) return <Text color="red">Error: {error}</Text>;
	if (!data) return <Text color="red">No data available</Text>;

	const taskStats = calculateTaskStats(data.allTasks);
	const activeProjects = data.projects.filter(p => p.status === 'active');
	const lastUpdate = getLastUpdateTime(data.allTasks);

	return (
		<Box flexDirection="column" gap={1}>
			{/* Header */}
			<Box flexDirection="column">
				<Text bold color="cyan">🚀 Astrolabe Dashboard</Text>
				<Text color="gray">Local-first task navigation platform</Text>
			</Box>

			{/* Project Overview */}
			<Box flexDirection="column">
				<Text bold>📁 Projects ({data.projects.length})</Text>
				{activeProjects.length > 0 ? (
					<Box flexDirection="column" paddingLeft={2}>
						{activeProjects.slice(0, 5).map((project) => (
							<Text key={project.id}>
								<Text color="green">●</Text> {project.title}
								{project.description && <Text color="gray"> - {project.description}</Text>}
							</Text>
						))}
						{activeProjects.length > 5 && (
							<Text color="gray">... and {activeProjects.length - 5} more</Text>
						)}
					</Box>
				) : (
					<Box paddingLeft={2}>
						<Text color="gray">No active projects</Text>
					</Box>
				)}
			</Box>

			{/* Task Statistics */}
			<Box flexDirection="column">
				<Text bold>📊 Task Statistics</Text>
				<Box flexDirection="column" paddingLeft={2}>
					<Text>
						Total: <Text color="cyan">{taskStats.total}</Text>
						{" | "}
						Completion: <Text color={taskStats.completionRate >= 70 ? "green" : taskStats.completionRate >= 40 ? "yellow" : "red"}>
							{taskStats.completionRate.toFixed(1)}%
						</Text>
					</Text>
					<Box flexDirection="row" gap={2}>
						<Text>
							<Text color="yellow">⏳</Text> Pending: {taskStats.pending}
						</Text>
						<Text>
							<Text color="blue">🔄</Text> In Progress: {taskStats.inProgress}
						</Text>
						<Text>
							<Text color="green">✅</Text> Done: {taskStats.done}
						</Text>
						{taskStats.cancelled > 0 && (
							<Text>
								<Text color="red">❌</Text> Cancelled: {taskStats.cancelled}
							</Text>
						)}
					</Box>
				</Box>
			</Box>

			{/* Root Tasks Overview */}
			{data.rootTasks.length > 0 && (
				<Box flexDirection="column">
					<Text bold>🎯 Top-Level Tasks ({data.rootTasks.length})</Text>
					<Box flexDirection="column" paddingLeft={2}>
						{data.rootTasks.slice(0, 8).map((task) => (
							<Text key={task.id}>
								{getStatusIcon(task.status)} <Text bold>{task.title}</Text>
								{task.description && <Text color="gray"> - {task.description}</Text>}
							</Text>
						))}
						{data.rootTasks.length > 8 && (
							<Text color="gray">... and {data.rootTasks.length - 8} more tasks</Text>
						)}
					</Box>
				</Box>
			)}

			{/* Recent Activity */}
			{data.recentTasks.length > 0 && (
				<Box flexDirection="column">
					<Text bold>🕒 Recent Activity</Text>
					<Box flexDirection="column" paddingLeft={2}>
						{data.recentTasks.slice(0, 5).map((task) => (
							<Text key={task.id}>
								{getStatusIcon(task.status)} {task.title}
								<Text color="gray"> - {formatRelativeTime(task.updatedAt)}</Text>
							</Text>
						))}
					</Box>
				</Box>
			)}

			{/* Quick Actions */}
			<Box flexDirection="column">
				<Text bold>⚡ Quick Actions</Text>
				<Box flexDirection="column" paddingLeft={2}>
					<Text>
						<Text color="cyan">astrolabe task list</Text> - View all tasks
					</Text>
					<Text>
						<Text color="cyan">astrolabe task add --title="Task name"</Text> - Create a new task
					</Text>
					{taskStats.pending > 0 && (
						<Text>
							<Text color="yellow">Next:</Text> Work on {taskStats.pending} pending task{taskStats.pending === 1 ? '' : 's'}
						</Text>
					)}
				</Box>
			</Box>

			{/* Footer */}
			{lastUpdate && (
				<Box flexDirection="column" marginTop={1}>
					<Text color="gray">Last updated: {formatRelativeTime(lastUpdate)}</Text>
				</Box>
			)}
		</Box>
	);
}

function calculateTaskStats(tasks: Task[]): TaskStats {
	const total = tasks.length;
	const pending = tasks.filter(t => t.status === 'pending').length;
	const inProgress = tasks.filter(t => t.status === 'in-progress').length;
	const done = tasks.filter(t => t.status === 'done').length;
	const cancelled = tasks.filter(t => t.status === 'cancelled').length;
	
	const completionRate = total > 0 ? (done / total) * 100 : 0;

	return {
		total,
		pending,
		inProgress,
		done,
		cancelled,
		completionRate,
	};
}

function getStatusIcon(status: string): string {
	switch (status) {
		case 'pending':
			return '⏳';
		case 'in-progress':
			return '🔄';
		case 'done':
			return '✅';
		case 'cancelled':
			return '❌';
		default:
			return '📋';
	}
}

function getLastUpdateTime(tasks: Task[]): Date | null {
	if (tasks.length === 0) return null;
	return tasks.reduce((latest, task) => 
		task.updatedAt > latest ? task.updatedAt : latest, 
		tasks[0]!.updatedAt
	);
}

function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / (1000 * 60));
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffMins < 1) return 'just now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	
	return date.toLocaleDateString();
} 