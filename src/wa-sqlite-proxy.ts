import { drizzle, type RemoteCallback } from "drizzle-orm/sqlite-proxy";
import type SQLite from "wa-sqlite";

type Cell = string | number | bigint | Uint8Array | null;
type Row = Cell[];

// Drizzle will use `columns` (when provided) to map Row -> object
type ProxyResult =
	| { rows: Row[]; columns?: string[] } // "all" | "values" | "run"
	| { rows: Row; columns?: string[] }; // "get"

export function drizzleFromWaSQLite(
	waSqliteImport: typeof SQLite,
	sqlite3: ReturnType<typeof SQLite.Factory>,
	db: number
) {
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
			} else if (typeof v === "bigint") {
                sqlite3.bind_int64(stmt, ix, v);
			} else if (v instanceof Uint8Array) {
				sqlite3.bind_blob(stmt, ix, v);
			} else if (typeof v === "boolean") {
				sqlite3.bind_int(stmt, ix, v ? 1 : 0);
			} else if (Array.isArray(v) || typeof v === "object") {
				// JSON — store as TEXT; blob-json callers can pass Uint8Array instead
				sqlite3.bind_text(stmt, ix, JSON.stringify(v));
			} else {
				sqlite3.bind_text(stmt, ix, String(v));
			}
		}
	}

	// Preserve native types from wa-sqlite
	function toCell(value: unknown): Cell {
		if (value === undefined) return null;
		if (value === null) return null;
		if (typeof value === "string") return value;
		if (typeof value === "number") return value;
		if (typeof value === "bigint") return value;
		if (value instanceof Uint8Array) return new Uint8Array(value);
		return String(value);
	}

	type Collected = { rows: Row[]; columns?: string[] };

	async function execCollect(
		sql: string,
		params: unknown[]
	): Promise<Collected> {
		const out: Row[] = [];
		let columns: string[] | undefined;

		for await (const stmt of sqlite3.statements(db, sql)) {
			if (params?.length) bindParams(stmt, params);

			const cols = sqlite3.column_count(stmt);

			// Keep column names for raw SQL mapping (first statement that returns columns wins)
			if (
				cols > 0 &&
				columns === undefined &&
				"column_names" in sqlite3
			) {
				columns = sqlite3.column_names(stmt) as string[];
			}

			// Non-SELECT: just step it to completion
			if (cols === 0) {
				while (
					(await sqlite3.step(stmt)) === waSqliteImport.SQLITE_ROW
				) {
					/* no-op */
				}
				continue;
			}

			while ((await sqlite3.step(stmt)) === waSqliteImport.SQLITE_ROW) {
				const row: Row = new Array(cols);
				for (let i = 0; i < cols; i++)
					row[i] = toCell(sqlite3.column(stmt, i));
				out.push(row);
			}
		}

		return { rows: out, columns };
	}

	const callback: RemoteCallback = async (
		sql,
		params,
		method
	): Promise<ProxyResult> => {
		// optional: emulate unsupported UPDATE/DELETE … ORDER BY … LIMIT (see below)
		switch (method) {
			case "run": {
				await execCollect(sql, params);
				return { rows: [], columns: [] };
			}
			case "get": {
				const { rows, columns } = await execCollect(sql, params);
				// Drizzle treats “no row” correctly when rows.length === 0
				// For “get” we must return a single Row, so only return the first row when present.
				return rows.length
					? { rows: rows[0], columns }
					: { rows: undefined };
			}
			case "values":
			case "all": {
				const { rows, columns } = await execCollect(sql, params);
				return { rows, columns };
			}
			default: {
				method satisfies never;
				throw new Error(`Unsupported method: ${method}`);
			}
		}
	};

	return drizzle(callback);
}
