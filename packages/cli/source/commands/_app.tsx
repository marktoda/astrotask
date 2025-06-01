import { TaskService, createDatabase } from "@astrolabe/core";
import { Text } from "ink";
import type { AppProps } from "pastel";
import React from "react";
import {
	DatabaseContext,
	type DatabaseContextValue,
} from "../context/DatabaseContext.js";

export default function App({ Component, commandProps }: AppProps) {
	const [context, setContext] = React.useState<DatabaseContextValue | null>(
		null,
	);

	// Run once; when the promise resolves we have the real Store and TaskService
	React.useEffect(() => {
		createDatabase()
			.then((store) => {
				console.log(`Initialized database at: ${store.pgLite.dataDir}`);
				const taskService = new TaskService(store);
				setContext({ store, taskService });
			})
			.catch((err) => {
				// You may want better error handling here
				console.error("DB init failed", err);
				process.exit(1);
			});
	}, []);

	if (!context) return <Text>Initialising database…</Text>;

	return (
		<DatabaseContext.Provider value={context}>
			<Component {...commandProps} />
		</DatabaseContext.Provider>
	);
}
