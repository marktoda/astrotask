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
		// Use the same configuration approach as the MCP server with locking enabled
		const dbOptions = {
			dataDir: process.env["DATABASE_PATH"] || "./data/astrolabe.db",
			verbose: process.env["DB_VERBOSE"] === "true",
			enableLocking: true,
			lockOptions: {
				processType: "cli", // Identify this as CLI process for lock debugging
			},
		};

		createDatabase(dbOptions)
			.then((store: any) => {
				console.log(
					`Initialized database at: ${store.pgLite.dataDir} (with locking)`,
				);
				const taskService = new TaskService(store);
				setContext({ store, taskService });
			})
			.catch((err: any) => {
				// Provide user-friendly error message for lock conflicts
				if (err.message?.includes("Database is currently in use")) {
					console.error("❌ Database is currently in use by another process.");
					console.error(
						"   Please wait a moment and try again, or check if the MCP server is running.",
					);
				} else {
					console.error(
						"❌ Database initialization failed:",
						err.message || err,
					);
				}
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
