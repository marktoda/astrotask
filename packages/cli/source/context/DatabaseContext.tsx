import { type Store } from "@astrolabe/core";
import React from "react";

export const DatabaseContext = React.createContext<Store | null>(null);

export function useDatabase() {
	const ctx = React.useContext(DatabaseContext);
	if (!ctx)
		throw new Error("useDatabase must be used inside <DatabaseProvider>");
	return ctx;
}
