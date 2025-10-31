import { describe, it, expect, beforeAll } from "vitest";
import { fs as zenFS } from "@zenfs/core";
// import nodeFS from "node:fs";

import type SQLite from "wa-sqlite";
// import { resolve } from "node:path";
// import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { MemoryVFS } from "./memory-vfs.js";
import { NodeVFS } from "./node-vfs.js";

const SQLITE_ROW = 100;

describe("SQLite WASM", () => {
	let sqliteImport: typeof SQLite;
	let sqlite3: ReturnType<typeof SQLite.Factory>;
	let vfs: MemoryVFS;

	beforeAll(async () => {
		sqliteImport = await import("wa-sqlite");
		const { default: SQLiteFactory } = await import(
			"wa-sqlite/dist/wa-sqlite.mjs"
		);

        let wasmPath: string;
        let wasmBinary: Uint8Array;

        // Load WASM binary depending on environment
        if (typeof process !== "undefined" && process?.versions?.node) {
            // Node.js environment
            const { resolve } = await import("node:path");
            const { readFile } = await import("node:fs/promises");
            wasmPath = resolve("node_modules/wa-sqlite/dist/wa-sqlite.wasm");
            wasmBinary = await readFile(wasmPath);
        } else {
            // Browser environment
            const response = await fetch("wa-sqlite.wasm");
            wasmBinary = new Uint8Array(await response.arrayBuffer());
        }

		const module = await SQLiteFactory({
			wasmBinary,
			// locateFile: (p: string) =>
			// 	pathToFileURL(resolve("node_modules/wa-sqlite/dist", p)).href,
		});

		sqlite3 = sqliteImport.Factory(module);
		vfs = await NodeVFS.create("node", module, { fs: zenFS });
		sqlite3.vfs_register(vfs, true);
	});

	it("should initialize SQLite module", async () => {
		expect(sqlite3).toBeDefined();
	});

	it("should create an in-memory database and run a simple query", async () => {
		const db = await sqlite3.open_v2(
			"/Users/gc/Projects/zenfs/test.db",
			sqliteImport.SQLITE_OPEN_READWRITE |
				sqliteImport.SQLITE_OPEN_CREATE,
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
			while ((await sqlite3.step(stmt)) === SQLITE_ROW) {
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

	// describe("File System", () => {
	// 	it("should create, write, read, and delete a file", async () => {
	// 		const filePath = "/testfile.txt";
	// 		const fileContent = "Hello, ZenFS!";

	// 		await fs.promises.writeFile(filePath, fileContent);
	// 		const readContent = await fs.promises.readFile(filePath, "utf-8");
	// 		expect(readContent).toBe(fileContent);

	// 		await fs.promises.unlink(filePath);

	// 		let fileExists = true;
	// 		try {
	// 			await fs.promises.access(filePath);
	// 		} catch {
	// 			fileExists = false;
	// 		}
	// 		expect(fileExists).toBe(false);
	// 	});
	// });
});
