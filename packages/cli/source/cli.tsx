#!/usr/bin/env node
import Pastel from "pastel";

const app = new Pastel({
	importMeta: import.meta,
	version: '0.1.0',
	description: 'A local-first, MCP-compatible task-navigation platform',
});

await app.run();
