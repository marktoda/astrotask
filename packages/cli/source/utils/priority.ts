/**
 * Convert priority score to a readable level
 */
export function scoreToPriorityLevel(score: number): "low" | "medium" | "high" {
	if (score < 20) return "low";
	if (score <= 70) return "medium";
	return "high";
}

/**
 * Get color for priority score
 */
export function getPriorityColor(priorityScore: number): string {
	if (priorityScore > 70) return "red"; // High priority
	if (priorityScore >= 20) return "yellow"; // Medium priority
	return "blue"; // Low priority
}

/**
 * Get priority icon based on score
 */
export function getPriorityIcon(priorityScore: number): string {
	if (priorityScore > 70) return "🔴"; // High priority
	if (priorityScore >= 20) return "🟡"; // Medium priority
	return "🔵"; // Low priority
}

/**
 * Format priority for display
 */
export function formatPriority(priorityScore: number): string {
	const level = scoreToPriorityLevel(priorityScore);
	return `${level} (${priorityScore})`;
}
