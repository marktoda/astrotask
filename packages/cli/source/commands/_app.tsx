import { TaskService, cfg, createDatabase } from "@astrolabe/core";
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
		let store: any = null;

		// Use the centralized configuration system that loads .env files
		const dbOptions = {
			dataDir: cfg.DATABASE_URI,
			verbose: cfg.DB_VERBOSE,
			enableLocking: true,
			lockOptions: {
				processType: "cli", // Identify this as CLI process for lock debugging
			},
		};

		// Cleanup function for graceful shutdown
		const cleanup = async () => {
			if (store) {
				try {
					await store.close();
				} catch (err: any) {
					console.error("Failed to close database connection:", err);
				}
			}
		};

		// Register process exit handlers
		const exitHandler = () => {
			cleanup().finally(() => process.exit(0));
		};

		process.on("SIGINT", exitHandler);
		process.on("SIGTERM", exitHandler);
		process.on("beforeExit", cleanup);

		createDatabase(dbOptions)
			.then((createdStore: any) => {
				store = createdStore;

				// Display appropriate connection info based on database type
				const connectionInfo = store.pgLite.dataDir
					? store.pgLite.dataDir
					: "PostgreSQL database";

				console.log(
					`Initialized database at: ${connectionInfo} (with locking)`,
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

		// Cleanup function to close database connection
		return () => {
			// Remove process handlers
			process.off("SIGINT", exitHandler);
			process.off("SIGTERM", exitHandler);
			process.off("beforeExit", cleanup);

			cleanup();
		};
	}, []);

	if (!context) return <Text>Initialising database…</Text>;

	return (
		<DatabaseContext.Provider value={context}>
			<Component {...commandProps} />
		</DatabaseContext.Provider>
	);
}
