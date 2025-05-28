import { type Store, TaskService } from "@astrolabe/core";
import React from "react";

export interface DatabaseContextValue {
	store: Store;
	taskService: TaskService;
}

export const DatabaseContext = React.createContext<DatabaseContextValue | null>(
	null,
);

export function useDatabase() {
	const ctx = React.useContext(DatabaseContext);
	if (!ctx)
		throw new Error("useDatabase must be used inside <DatabaseProvider>");
	return ctx.store;
}

export function useTaskService() {
	const ctx = React.useContext(DatabaseContext);
	if (!ctx)
		throw new Error("useTaskService must be used inside <DatabaseProvider>");
	return ctx.taskService;
}
