import { drizzle, type RemoteCallback } from "drizzle-orm/sqlite-proxy";
import type SQLite from "wa-sqlite";

type Cell = string | number | bigint | Uint8Array | null;
type Row = Cell[];

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
				// JSON: store text; callers wanting blob-json should pass Uint8Array
				sqlite3.bind_text(stmt, ix, JSON.stringify(v));
			} else {
				sqlite3.bind_text(stmt, ix, String(v));
			}
		}
	}

	function toCell(value: unknown): Cell {
		if (value === undefined || value === null) return null;
		if (
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "bigint"
		)
			return value as any;
		// Ensure plain Uint8Array for strict equality (avoid Node Buffer metadata)
		if (
			value instanceof Uint8Array ||
			(typeof value === "object" &&
				value !== null &&
				(value as any).constructor?.name === "Buffer")
		) {
			return new Uint8Array(value as Uint8Array);
		}
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
			const colCount = sqlite3.column_count(stmt);

			// Always compute column names so Drizzle maps rows → objects
			if (colCount > 0 && columns === undefined) {
				const names: string[] = [];
				for (let i = 0; i < colCount; i++) {
					// wa-sqlite exposes column_name(stmt, i)
					names.push(sqlite3.column_name(stmt, i) as string);
				}
				columns = names;
			}

			if (colCount === 0) {
				while (
					(await sqlite3.step(stmt)) === waSqliteImport.SQLITE_ROW
				) {
					/* no-op */
				}
				continue;
			}

			while ((await sqlite3.step(stmt)) === waSqliteImport.SQLITE_ROW) {
				const row: Row = new Array(colCount);
				for (let i = 0; i < colCount; i++)
					row[i] = toCell(sqlite3.column(stmt, i));
				out.push(row);
			}
		}

		return { rows: out, columns };
	}

	function isUpdateOrDeleteWithOrderLimit(sql: string): boolean {
		// We intentionally don't support these; surface a clear error.
		const s = sql.replace(/\s+/g, " ").toLowerCase();
		const isUpdDel = s.startsWith("update ") || s.startsWith("delete ");
		return isUpdDel && s.includes(" order by ") && s.includes(" limit ");
	}

	const callback: RemoteCallback = async (
		sql,
		params,
		method
	): Promise<ProxyResult> => {
		if (isUpdateOrDeleteWithOrderLimit(sql)) {
			throw new Error(
				"Unsupported SQL: UPDATE/DELETE with ORDER BY and LIMIT. " +
					"This SQLite build lacks SQLITE_ENABLE_UPDATE_DELETE_LIMIT and this adapter does not emulate it."
			);
		}

		switch (method) {
			case "run": {
				await execCollect(sql, params ?? []);
				return { rows: [], columns: [] };
			}
			case "get": {
				const { rows, columns } = await execCollect(sql, params ?? []);
				return rows.length
					? { rows: rows[0], columns }
					: ({ rows: undefined as unknown as Row, columns } as any);
			}
			case "values":
			case "all": {
				const { rows, columns } = await execCollect(sql, params ?? []);
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
