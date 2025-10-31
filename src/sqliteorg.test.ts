import { describe, it, expect, beforeAll } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

let __here: string;
let node_resolved_wasm: string;

// if we're in node, set __here and resolved_wasm
if (typeof process !== "undefined" && process?.versions?.node) {
	const { dirname: node_dirname, resolve: node_resolve } = await import(
		"node:path"
	);
	const { fileURLToPath } = await import("node:url");

	__here = node_dirname(fileURLToPath(import.meta.url));
	node_resolved_wasm = "./node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm";
}

describe("SQLite WASM", () => {
	let sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>>;

	beforeAll(async () => {
		sqlite3 = await sqlite3InitModule({
			locateFile: (p: string) => {
				if (node_resolved_wasm) {
                    console.log("Running in Node.js environment");
					return node_resolved_wasm;
				}

				// your browser build path (served by Vite)
                console.log("Running in Browser environment");
                const resolved = p.endsWith(".wasm") ? "sqlite3.wasm" : p;
                console.log("Resolved path:", resolved);
                return resolved;
			},
		});
	});

	it("should initialize SQLite module", async () => {
		expect(sqlite3).toBeDefined();
		expect(sqlite3.version).toBeDefined();
	});

	it("should create an in-memory database and run a simple query", async () => {
		const db = new sqlite3.oo1.DB(":memory:");

		db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT);");
		db.exec("INSERT INTO test (name) VALUES ('Alice'), ('Bob');");

		type Row = { id: number; name: string };
		const results: Row[] = db.selectObjects(
			"SELECT id, name FROM test ORDER BY id;"
		) as Row[];

		db.close();

		expect(results).toEqual([
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		]);
	});
});
