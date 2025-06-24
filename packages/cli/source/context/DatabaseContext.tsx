import { type Astrotask, type Store } from "@astrotask/core";
import React from "react";

export interface DatabaseContextValue {
	astrotask: Astrotask;
}

export const DatabaseContext = React.createContext<DatabaseContextValue | null>(
	null,
);

export function useAstrotask() {
	const ctx = React.useContext(DatabaseContext);
	if (!ctx)
		throw new Error("useAstrotask must be used inside <DatabaseProvider>");
	return ctx.astrotask;
}

export function useDatabase(): Store {
	const ctx = React.useContext(DatabaseContext);
	if (!ctx)
		throw new Error("useDatabase must be used inside <DatabaseProvider>");
	return ctx.astrotask.store;
}

export function useTaskService() {
	const ctx = React.useContext(DatabaseContext);
	if (!ctx)
		throw new Error("useTaskService must be used inside <DatabaseProvider>");
	return ctx.astrotask.taskService;
}

// NEW: Enhanced hooks for tree-centric API
export function useTasks(parentId?: string) {
	const astrotask = useAstrotask();
	return React.useMemo(() => astrotask.tasks(parentId), [astrotask, parentId]);
}

export function useDependencies(graphId?: string) {
	const astrotask = useAstrotask();
	return React.useMemo(
		() => astrotask.dependencies(graphId),
		[astrotask, graphId],
	);
}
