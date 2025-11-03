import { describe, it, expect, beforeAll } from "vitest";
import * as VFS from "wa-sqlite/src/VFS.js";
import { fs as zenFS } from "@zenfs/core";

import type SQLite from "wa-sqlite";
import { MemoryVFS } from "./memory-vfs.js";
import { NodeVFS } from "./node-vfs.js";
import { initSQLite } from "./utils.js";
import {
	BaseSQLiteDatabase,
	sqliteTable,
	text,
	integer,
} from "drizzle-orm/sqlite-core";
import { drizzleFromWaSQLite } from "./wa-sqlite-proxy.js";
import { asc } from "drizzle-orm";

let db: BaseSQLiteDatabase<"async" | "sync", any, Record<string, never>>;
let waSqliteImport: typeof SQLite;
let waSqliteModule: any;
let sqlite3: ReturnType<typeof SQLite.Factory>;
let vfs: MemoryVFS | NodeVFS;

beforeAll(async () => {
	({ sqlite3, waSqliteImport, waSqliteModule } = await initSQLite());

	vfs = await NodeVFS.create("node", waSqliteModule, { fs: zenFS });
	sqlite3.vfs_register(vfs, true);

	const client = await sqlite3.open_v2(
		"/Users/gc/Projects/zenfs/test.db",
		waSqliteImport.SQLITE_OPEN_READWRITE |
			waSqliteImport.SQLITE_OPEN_CREATE,
		vfs.name
	);

	db = drizzleFromWaSQLite(waSqliteImport, sqlite3, client);
});

describe("Drizzle SQLite Proxy", () => {
	// do nothing for now
	it("should work", () => {
		expect(true).toBe(true);
	});

	it("should run a simple query", async () => {
		let test_table = sqliteTable("test_drizzle", {
			id: integer("id").primaryKey(),
			name: text("name").notNull(),
			email: text("email").notNull(),
			metadata: text("metadata", { mode: "json" }).notNull().default({}),
		});

        const createTable = `CREATE TABLE IF NOT EXISTS test_drizzle (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            metadata TEXT NOT NULL DEFAULT '{}'
        );`;

        await db.run(createTable);

		await db
			.insert(test_table)
            .values([
                { id: 1, name: "Alice", email: "alice@example.com", metadata: { age: 30 } },
                { id: 2, name: "Bob", email: "bob@example.com", metadata: { age: 25 } },
            ])
            .run();

		const rows = await db
			.select()
			.from(test_table)
			.orderBy(asc(test_table.id))
			.all();

		expect(rows).toEqual([
			{ id: 1, name: "Alice", email: "alice@example.com", metadata: { age: 30 } },
			{ id: 2, name: "Bob", email: "bob@example.com", metadata: { age: 25 } },
		]);
	});
});

// beforeAll(async () => {
// 	const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';
// 	client = new Database(dbPath);
// 	serverSimulator = new ServerSimulator(client);

// 	const callback = async (sql: string, params: any[], method: string) => {
// 		try {
// 			const rows = await serverSimulator.query(sql, params, method);

// 			if (rows.error !== undefined) {
// 				throw new Error(rows.error);
// 			}

// 			return { rows: rows.data };
// 		} catch (e: any) {
// 			console.error('Error from sqlite proxy server:', e.response?.data ?? e.message);
// 			throw e;
// 		}
// 	};
// 	db = proxyDrizzle(callback);
// 	cachedDb = proxyDrizzle(callback, { cache: new TestCache() });
// 	dbGlobalCached = proxyDrizzle(callback, { cache: new TestGlobalCache() });
// });
