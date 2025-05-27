import { type Store, createDatabase } from "@astrolabe/core";
import { Text } from "ink";
import type { AppProps } from "pastel";
import { useEffect, useState } from "react";

// Enhanced props that include the database store
export type TaskProps<T = Record<string, never>> = T & {
	db: Store;
};

export default function App({ Component, commandProps }: AppProps) {
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
				setDbError(
					err instanceof Error ? err.message : "Failed to initialize database",
				);
			}
		}
		initDb();
	}, []);

	if (dbError) {
		return <Text color="red">Database Error: {dbError}</Text>;
	}

	if (!store) {
		return <Text>Initializing database...</Text>;
	}

	// biome-ignore lint/suspicious/noExplicitAny
	const Comp = Component as React.ComponentType<any>;
	// biome-ignore lint/suspicious/noExplicitAny
	return <Comp {...(commandProps as any)} db={store} />;
}
