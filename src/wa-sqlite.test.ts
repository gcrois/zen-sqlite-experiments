import { describe, it, expect, beforeAll } from "vitest";
import { fs as zenFS } from "@zenfs/core";

import type SQLite from "wa-sqlite";
import { MemoryVFS } from "./memory-vfs.js";
import { NodeVFS } from "./node-vfs.js";
import { initSQLite } from "./utils.js";

describe("SQLite WASM", () => {
	let waSqliteImport: typeof SQLite;
    let waSqliteModule: any;
	let sqlite3: ReturnType<typeof SQLite.Factory>;
	let vfs: MemoryVFS | NodeVFS;

	beforeAll(async () => {
		({ sqlite3, waSqliteImport, waSqliteModule } = await initSQLite());

		vfs = await NodeVFS.create("node", waSqliteModule, { fs: zenFS });
		sqlite3.vfs_register(vfs, true);
	});

	it("should initialize SQLite module", async () => {
		expect(sqlite3).toBeDefined();
	});

	it("should create an in-memory database and run a simple query", async () => {
		const db = await sqlite3.open_v2(
			"/Users/gc/Projects/zenfs/test.db",
			waSqliteImport.SQLITE_OPEN_READWRITE |
				waSqliteImport.SQLITE_OPEN_CREATE,
			vfs.name
		);

		// drop table if exists to ensure test idempotency
		await sqlite3.exec(db, "DROP TABLE IF EXISTS test;");
		await sqlite3.exec(
			db,
			"CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT);"
		);
		await sqlite3.exec(
			db,
			"INSERT INTO test (name) VALUES ('Alice'), ('Bob');"
		);

		const rows: { id: number; name: string }[] = [];
		for await (const stmt of sqlite3.statements(
			db,
			"SELECT id, name FROM test ORDER BY id;"
		)) {
			const colNames = sqlite3.column_names(stmt);
			while ((await sqlite3.step(stmt)) === waSqliteImport.SQLITE_ROW) {
				const row: Record<string, unknown> = {};
				for (let i = 0; i < colNames.length; i++) {
					row[colNames[i]] = sqlite3.column(stmt, i);
				}
				rows.push({ id: row.id as number, name: row.name as string });
			}
			await sqlite3.finalize(stmt);
		}

		expect(rows).toEqual([
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		]);

		await sqlite3.close(db);
	});
});
