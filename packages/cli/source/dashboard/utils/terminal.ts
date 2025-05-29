export function setupTerminal() {
	// Suppress terminfo warnings
	process.env["NODE_NO_WARNINGS"] = "1";

	// Set up terminal type for better compatibility
	if (!process.env["TERM"]) {
		// Try to detect the best terminal type
		if (process.platform === "win32") {
			process.env["TERM"] = "windows-ansi";
		} else if (process.env["COLORTERM"] === "truecolor") {
			process.env["TERM"] = "xterm-256color";
		} else {
			process.env["TERM"] = "xterm";
		}
	}

	// Ensure we're in a TTY environment
	if (!process.stdout.isTTY) {
		console.error("Error: Dashboard requires an interactive terminal (TTY)");
		process.exit(1);
	}
}

export function clearScreen() {
	if (process.stdout.isTTY) {
		process.stdout.write("\x1b[?25l"); // Hide cursor
		process.stdout.write("\x1b[2J\x1b[0f"); // Clear screen
	}
}

export function showCursor() {
	if (process.stdout.isTTY) {
		process.stdout.write("\x1b[?25h"); // Show cursor
	}
}
