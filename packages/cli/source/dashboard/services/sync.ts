import type { StoreApi } from "zustand";
import type { DashboardStore } from "../store/index.js";

export class SyncService {
	private syncInterval: ReturnType<typeof setInterval> | null = null;
	private lastSync: Date | null = null;

	constructor(
		private store: StoreApi<DashboardStore>,
		private syncIntervalMs = 30000, // 30 seconds
	) {}

	start() {
		// Initial sync
		this.sync();

		// Set up periodic sync
		this.syncInterval = setInterval(() => {
			this.sync();
		}, this.syncIntervalMs);
	}

	stop() {
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
			this.syncInterval = null;
		}
	}

	async sync() {
		try {
			const state = this.store.getState();

			// Use reloadFromDatabase which handles pending changes properly
			// instead of loadTasks which rebuilds everything from scratch
			await state.reloadFromDatabase();

			this.lastSync = new Date();
			state.setStatusMessage(`Synced at ${this.lastSync.toLocaleTimeString()}`);
		} catch (error) {
			const state = this.store.getState();
			state.setStatusMessage(`Sync failed: ${error}`);
		}
	}

	getLastSyncTime(): Date | null {
		return this.lastSync;
	}

	forceSync() {
		return this.sync();
	}
}
