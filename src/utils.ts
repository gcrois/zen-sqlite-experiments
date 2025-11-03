
export async function initSQLite() {
	const waSqliteImport = await import("wa-sqlite");
	const { default: SQLiteFactory } = await import(
		"wa-sqlite/dist/wa-sqlite.mjs"
	);

	let wasmBinary: Uint8Array;

	// Load WASM binary depending on environment
	if (typeof process !== "undefined" && process?.versions?.node) {
		const { resolve } = await import("node:path");
		const { readFile } = await import("node:fs/promises");
		const wasmPath = resolve("node_modules/wa-sqlite/dist/wa-sqlite.wasm");
		wasmBinary = await readFile(wasmPath);
	} else {
		const response = await fetch("wa-sqlite.wasm");
		wasmBinary = new Uint8Array(await response.arrayBuffer());
	}

	const waSqliteModule = await SQLiteFactory({ wasmBinary });
	const sqlite3 = waSqliteImport.Factory(waSqliteModule);

	return { sqlite3, waSqliteImport, waSqliteModule };
}
