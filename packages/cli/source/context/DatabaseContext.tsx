import { type Astrotask } from "@astrotask/core";
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

export function useDatabase() {
	const ctx = React.useContext(DatabaseContext);
	if (!ctx)
		throw new Error("useDatabase must be used inside <DatabaseProvider>");
	return ctx.astrotask.store;
}

export function useTaskService() {
	const ctx = React.useContext(DatabaseContext);
	if (!ctx)
		throw new Error("useTaskService must be used inside <DatabaseProvider>");
	return ctx.astrotask.tasks;
}
