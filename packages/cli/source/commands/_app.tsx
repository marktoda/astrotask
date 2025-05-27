import { Store, createDatabase } from "@astrolabe/core";
import { Text } from "ink";
import type { AppProps } from "pastel";
import React from "react";
import { DatabaseContext } from "../context/DatabaseContext.js";

export default function App({ Component, commandProps }: AppProps) {
	const [db, setDb] = React.useState<Store | null>(null);

	// Run once; when the promise resolves we have the real Store
	React.useEffect(() => {
		createDatabase()
			.then(setDb)
			.catch((err) => {
				// You may want better error handling here
				console.error("DB init failed", err);
				process.exit(1);
			});
	}, []);

	if (!db) return <Text>Initialising database…</Text>;

	return (
		<DatabaseContext.Provider value={db}>
			<Component {...commandProps} />
		</DatabaseContext.Provider>
	);
}
