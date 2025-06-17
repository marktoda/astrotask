import { type Astrotask, cfg, createAstrotask } from "@astrotask/core";
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

	// Run once; when the promise resolves we have the real Astrotask SDK instance
	React.useEffect(() => {
		let astrotask: Astrotask | null = null;

		// Set CLI mode for reduced logging verbosity
		process.env["CLI_MODE"] = "true";

		// Cleanup function for graceful shutdown
		const cleanup = async () => {
			if (astrotask) {
				try {
					await astrotask.dispose();
				} catch (err) {
					console.error(
						"Failed to dispose Astrotask SDK:",
						err instanceof Error ? err.message : String(err),
					);
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

		createAstrotask({
			databaseUrl: cfg.DATABASE_URI,
			debug: cfg.DB_VERBOSE,
		})
			.then((createdAstrotask: Astrotask) => {
				astrotask = createdAstrotask;

				// Display appropriate connection info based on database type
				const connectionInfo =
					astrotask.databaseType === "sqlite"
						? `SQLite database at ${cfg.DATABASE_URI}`
						: `${astrotask.databaseType} database`;

				// Only show initialization message if not running dashboard
				const isDashboard = process.argv.some(arg => arg.includes('dashboard'));
				if (!isDashboard) {
					console.log(`Initialized Astrotask SDK with ${connectionInfo}`);
				}
				setContext({ astrotask });
			})
			.catch((err) => {
				// Provide user-friendly error message for initialization failures
				const errorMessage = err instanceof Error ? err.message : String(err);
				if (errorMessage.includes("Database is currently in use")) {
					console.error("❌ Database is currently in use by another process.");
					console.error(
						"   Please wait a moment and try again, or check if the MCP server is running.",
					);
				} else {
					console.error(
						"❌ Astrotask SDK initialization failed:",
						errorMessage,
					);
				}
				process.exit(1);
			});

		// Cleanup function to dispose SDK
		return () => {
			// Remove process handlers
			process.off("SIGINT", exitHandler);
			process.off("SIGTERM", exitHandler);
			process.off("beforeExit", cleanup);

			cleanup();
		};
	}, []);

	if (!context) {
		// Only show initializing message if not running dashboard
		const isDashboard = process.argv.some(arg => arg.includes('dashboard'));
		if (isDashboard) {
			// Return empty element for dashboard to avoid any output
			return null;
		}
		return <Text>Initialising Astrotask SDK…</Text>;
	}

	return (
		<DatabaseContext.Provider value={context}>
			<Component {...commandProps} />
		</DatabaseContext.Provider>
	);
}
