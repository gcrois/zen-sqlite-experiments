import { drizzle, type RemoteCallback } from "drizzle-orm/sqlite-proxy";
import type SQLite from "wa-sqlite";

type Cell = string | number | bigint | null;
type Row = Cell[];

type ProxyResult =
	| { rows: Row[] } // "all" | "values" | "run"
	| { rows: Row };  // "get"

export function drizzleFromWaSQLite(
	waSqliteImport: typeof SQLite,
	sqlite3: ReturnType<typeof SQLite.Factory>,
	db: number
) {
	/* Binds JS values to SQLite parameters (1-based) */
	function bindParams(stmt: number, params: unknown[]) {
		for (let i = 0; i < params.length; i++) {
			const ix = i + 1;
			const v = params[i];

			if (v === null || v === undefined) {
				sqlite3.bind_null(stmt, ix);
			} else if (typeof v === "number") {
				Number.isInteger(v)
					? sqlite3.bind_int(stmt, ix, v)
					: sqlite3.bind_double(stmt, ix, v);
			} else if (typeof v === "string") {
				sqlite3.bind_text(stmt, ix, v);
			} else if (v instanceof Uint8Array) {
				sqlite3.bind_blob(stmt, ix, v);
			} else if (typeof v === "bigint") {
				// Store bigint as int64 if possible
				sqlite3.bind_int64
					? sqlite3.bind_int64(stmt, ix, v)
					: sqlite3.bind_text(stmt, ix, v.toString());
			} else if (typeof v === "boolean") {
				sqlite3.bind_int(stmt, ix, v ? 1 : 0);
			} else {
				// Fallback: JSON
				sqlite3.bind_text(stmt, ix, JSON.stringify(v));
			}
		}
	}

	/* Convert SQLite value to a Cell that preserves numeric types */
	function toCell(value: unknown): Cell {
		if (value === undefined) return null;
		if (value === null) return null;
		if (typeof value === "string") return value;
		if (typeof value === "number") return value;   // keep numbers
		if (typeof value === "bigint") return value;   // keep bigints
		if (typeof value === "boolean") return value ? 1 : 0; // normalize bools
		if (value instanceof Uint8Array) {
			// hex-encode blobs to remain JSON-serializable
			return Array.from(value).map((b) => b.toString(16).padStart(2, "0")).join("");
		}
		// Anything else → stringify to be safe
		return String(value);
	}

	/* Collect rows preserving native numeric/bigint/null types */
	async function execCollectRows(sql: string, params: unknown[]): Promise<Row[]> {
		const out: Row[] = [];

		for await (const stmt of sqlite3.statements(db, sql)) {
			if (params?.length) bindParams(stmt, params);

			const cols = sqlite3.column_count(stmt);

			// Non-SELECT: step to completion and continue
			if (cols === 0) {
				while ((await sqlite3.step(stmt)) === waSqliteImport.SQLITE_ROW) { /* no-op */ }
				continue;
			}

			while ((await sqlite3.step(stmt)) === waSqliteImport.SQLITE_ROW) {
				const row: Row = new Array(cols);
				for (let i = 0; i < cols; i++) {
					row[i] = toCell(sqlite3.column(stmt, i));
				}
				out.push(row);
			}
			// No finalize: iterator scopes statement lifetime
		}

		return out;
	}

	const callback: RemoteCallback = async (sql, params, method): Promise<ProxyResult> => {
		switch (method) {
			case "run": {
				await execCollectRows(sql, params);
				return { rows: [] };
			}
			case "get": {
				const rows = await execCollectRows(sql, params);
				return { rows: rows[0] ?? [] };
			}
			case "values":
			case "all": {
				const rows = await execCollectRows(sql, params);
				return { rows };
			}
			default: {
				(method satisfies never);
				throw new Error(`Unsupported method: ${method}`);
			}
		}
	};

	return drizzle(callback);
}
