import path from "path";
import { fileURLToPath } from "url";
import { Text } from "ink";
import React from "react";

export const description = "Launch the interactive TUI dashboard";

export default function Dashboard() {
	React.useEffect(() => {
		// Exit the Ink app and launch blessed dashboard
		process.nextTick(() => {
			// Get the path to the blessed dashboard entry point
			const dashboardPath = path.join(
				path.dirname(fileURLToPath(import.meta.url)),
				"../dashboard/index.js",
			);

			// Launch blessed dashboard in the same process
			import(dashboardPath).catch((err) => {
				console.error("Failed to launch dashboard:", err);
				process.exit(1);
			});
		});
	}, []);

	return <Text>Launching interactive dashboard...</Text>;
}
