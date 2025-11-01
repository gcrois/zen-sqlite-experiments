// Adapted from https://github.com/tndrle/node-sqlite3-wasm/blob/main/src/vfs.js

import type { fs as ZenFS } from "@zenfs/core";
import type nodeFs from "node:fs";
import { FacadeVFS } from "wa-sqlite/src/FacadeVFS.js";
import * as VFS from "wa-sqlite/src/VFS.js";

// ---- single global toggle ----------------------------------------------------
const DEBUG: boolean = true || (globalThis as any).NODE_VFS_DEBUG === "1";

const dlog = (...args: unknown[]) => {
	if (DEBUG) console.log("[PortableVFS]", ...args);
};
const derr = (...args: unknown[]) => {
	if (DEBUG) console.error("[PortableVFS]", ...args);
};

// ---- minimal types -----------------------------------------------------------
type ArrayBufferViewRW =
	| Uint8Array
	| DataView
	| Int8Array
	| Uint16Array
	| Uint32Array
	| Float32Array
	| Float64Array;

type OpenFile = {
	fd: number;
	pathname: string;
	flags: number;
	deleteOnClose: boolean;
	locked: boolean;
};

// ---- options / utils ---------------------------------------------------------
type RandomFn = (dst: Uint8Array) => void;

type FSLike = typeof ZenFS | typeof nodeFs;

type PortableVFSOptions = {
	fs: FSLike; // filesystem implementation
	base?: string; // base directory for relative names (default "/")
};

// Default POSIX-ish flag fallbacks if fs.constants not provided.
const DEFAULT_CONST = {
	O_RDONLY: 0,
	O_WRONLY: 1,
	O_RDWR: 2,
	O_CREAT: 0o100, // 64
	O_EXCL: 0o200, // 128
	F_OK: 0,
};

// Try to get randomness without node:crypto.
const defaultRandom: RandomFn = (dst: Uint8Array) => {
	const g: any = globalThis as any;
	if (g.crypto && typeof g.crypto.getRandomValues === "function") {
		g.crypto.getRandomValues(dst);
		return;
	}
	// Fallback: NOT CRYPTOGRAPHIC; adequate for SQLite PRNG seeding requirements.
	for (let i = 0; i < dst.length; i++) dst[i] = (Math.random() * 256) | 0;
};

function dirnamePortable(p: string): string {
	if (!p) return "/";
	const i = p.lastIndexOf("/");
	if (i <= 0) return "/";
	return p.slice(0, i);
}

function mkdirpPortable(fs: FSLike, dir: string): void {
	if (!fs.mkdirSync) return; // skip if not available
	// Normalize multiple slashes and handle absolute roots.
	const parts = dir.split("/").filter((s, idx) => s.length > 0 || idx === 0);
	let cur = dir.startsWith("/") ? "/" : "";
	for (const part of parts) {
		if (part === "") continue; // skip extra slashes
		cur = cur === "/" ? `/${part}` : cur ? `${cur}/${part}` : part;
		try {
			fs.mkdirSync(cur);
		} catch (e: any) {
			// OK if exists; otherwise rethrow.
			if (e?.code !== "EEXIST") throw e;
		}
	}
}

// Node accepts Buffer|TypedArray; ZenFS requires ArrayBufferView.
// Wrap in Buffer if available to keep Node happy with Uint8ArrayProxy.
const toBufferView = (view: Uint8Array): Uint8Array | Buffer => {
	const B: any = (globalThis as any).Buffer;
	return B ? B.from(view.buffer, view.byteOffset, view.byteLength) : view;
};

// Detect if fs.readSync/fs.writeSync use Node’s 5-arg signature.
const isNodeVariadicRW = (fs: FSLike) => {
	const rlen =
		typeof fs.readSync === "function" ? (fs.readSync as any).length : 0;
	const wlen =
		typeof fs.writeSync === "function" ? (fs.writeSync as any).length : 0;
	return rlen >= 5 || wlen >= 5;
};

// Resolve a filename against a base using URL-only logic (no node:path).
// - If name has "://", treat as URL, use url.pathname
// - Else if name starts with "/", use as-is
// - Else join with base: `${base.replace(/\/+$/,'')}/${name}`
// On Windows drive letters should be passed in via base if needed; we do not
// attempt to translate drive letters.
function resolveNameURL(name: string | null | undefined, base: string): string {
	const n = name ?? Math.random().toString(36).slice(2);
	if (n.includes("://")) {
		try {
			return new URL(n).pathname;
		} catch {
			/* fall through */
		}
	}
	if (n.startsWith("/")) return n;
	const root = base || "/";
	const prefix = root.endsWith("/") ? root.slice(0, -1) : root;
	return `${prefix}/${n}`;
}

// ---- Portable read/write shims ----------------------------------------------
function readSyncPortable(
	fs: FSLike,
	fd: number,
	view: Uint8Array,
	offset: number,
	length: number,
	position: number
): number {
	if (!fs.readSync) throw new Error("fs.readSync not available");
	if (isNodeVariadicRW(fs)) {
		return (fs.readSync as any)(
			fd,
			toBufferView(view),
			0,
			length,
			position
		);
	} else {
		const opts = { offset, length, position };
		return (fs.readSync as any)(fd, view as ArrayBufferViewRW, opts);
	}
}

function writeSyncPortable(
	fs: FSLike,
	fd: number,
	view: Uint8Array,
	offset: number,
	length: number,
	position: number
): number {
	if (!fs.writeSync) throw new Error("fs.writeSync not available");
	if (isNodeVariadicRW(fs)) {
		return (fs.writeSync as any)(
			fd,
			toBufferView(view),
			0,
			length,
			position
		);
	} else {
		const opts = { offset, length, position };
		return (fs.writeSync as any)(fd, view as ArrayBufferViewRW, opts);
	}
}

// ===================================================================================

export class NodeVFS extends FacadeVFS {
	name = "portable";
	private mapIdToOpen: Map<number, OpenFile> = new Map();
	private readonly fs: FSLike;
	private readonly C: Required<typeof DEFAULT_CONST>;
	private readonly base: string;
	private readonly randomBytes: RandomFn;
	private readonly useDirLocks: boolean;

	static async create(
		name: string,
		module: WebAssembly.Module | WebAssembly.Instance,
		options: PortableVFSOptions
	) {
		const vfs = new NodeVFS(name, module, options);
		await vfs.isReady();
		return vfs;
	}

	constructor(
		name: string,
		module: WebAssembly.Module | WebAssembly.Instance,
		options: PortableVFSOptions
	) {
		super(name, module);
		this.fs = options.fs;
		const c = (options.fs.constants ?? {}) as any;
		this.C = {
			O_RDONLY: c.O_RDONLY ?? DEFAULT_CONST.O_RDONLY,
			O_WRONLY: c.O_WRONLY ?? DEFAULT_CONST.O_WRONLY,
			O_RDWR: c.O_RDWR ?? DEFAULT_CONST.O_RDWR,
			O_CREAT: c.O_CREAT ?? DEFAULT_CONST.O_CREAT,
			O_EXCL: c.O_EXCL ?? DEFAULT_CONST.O_EXCL,
			F_OK: c.F_OK ?? DEFAULT_CONST.F_OK,
		};
		this.base = options.base ?? "/";
		this.randomBytes = defaultRandom;
		this.useDirLocks = true;

		dlog("constructed", {
			name,
			base: this.base,
			hasDirLocks: this.useDirLocks,
		});
	}

	close(): void {
		dlog("close()", "openCount=", this.mapIdToOpen.size);
		for (const fileId of this.mapIdToOpen.keys()) this.jClose(fileId);
	}

	// --- helpers ----------------------------------------------------------------

	private resolveName(filename?: string | null): string {
		const p = resolveNameURL(filename, this.base);
		return p;
	}

	private openFlags(sqliteFlags: number): number {
		let oflags = 0;
		const ro = (sqliteFlags & VFS.SQLITE_OPEN_READONLY) !== 0;
		const rw = (sqliteFlags & VFS.SQLITE_OPEN_READWRITE) !== 0;
		const cr = (sqliteFlags & VFS.SQLITE_OPEN_CREATE) !== 0;
		const ex = (sqliteFlags & VFS.SQLITE_OPEN_EXCLUSIVE) !== 0;

		if (ro && !rw) oflags |= this.C.O_RDONLY;
		if (rw) oflags |= this.C.O_RDWR;
		if (cr) oflags |= this.C.O_CREAT;
		if (ex) oflags |= this.C.O_EXCL;

		if ((oflags & (this.C.O_RDONLY | this.C.O_RDWR)) === 0) {
			oflags |= this.C.O_RDONLY;
		}
		return oflags;
	}

	private get(fileId: number): OpenFile | undefined {
		return this.mapIdToOpen.get(fileId);
	}

	// --- FacadeVFS j* methods ---------------------------------------------------

	jOpen(
		filename: string | null,
		fileId: number,
		flags: number,
		pOutFlags: DataView
	): number {
		const fs = this.fs;
		const pathname = this.resolveName(filename ?? undefined);
		const oflags = this.openFlags(flags);
		dlog("jOpen →", { fileId, filename, pathname, flags, oflags });

		// If not CREATE, require the file to already exist.
		if (!(flags & VFS.SQLITE_OPEN_CREATE) && fs.accessSync) {
			try {
				fs.accessSync(pathname, this.C.F_OK);
			} catch (e: any) {
				derr("jOpen: CANTOPEN (not exists)", {
					pathname,
					code: e?.code,
					msg: e?.message,
				});
				return VFS.SQLITE_CANTOPEN;
			}
		}

		if (!fs.openSync) {
			derr("jOpen: CANTOPEN (openSync not available)");
			return VFS.SQLITE_CANTOPEN;
		}

		// NEW: Ensure the parent directory exists when creating.
		if (flags & VFS.SQLITE_OPEN_CREATE) {
			try {
				const parent = dirnamePortable(pathname);
				mkdirpPortable(this.fs, parent);
			} catch (e: any) {
				derr("jOpen: mkdirp failed", {
					pathname,
					code: e?.code,
					msg: e?.message,
				});
				return VFS.SQLITE_CANTOPEN;
			}
		}

		let fd: number;
		try {
			fd = fs.openSync(pathname, oflags, 0o666);
		} catch (e: any) {
			derr("jOpen: CANTOPEN (openSync failed)", {
				pathname,
				code: e?.code,
				msg: e?.message,
			});
			return VFS.SQLITE_CANTOPEN;
		}

		const deleteOnClose = (flags & VFS.SQLITE_OPEN_DELETEONCLOSE) !== 0;
		this.mapIdToOpen.set(fileId, {
			fd,
			pathname,
			flags,
			deleteOnClose,
			locked: false,
		});
		pOutFlags.setInt32(0, flags, true);

		dlog("jOpen ✓", { fileId, fd, deleteOnClose });
		return VFS.SQLITE_OK;
	}

	jClose(fileId: number): number {
		const fs = this.fs;
		const of = this.get(fileId);
		if (!of) {
			dlog("jClose: not open", { fileId });
			return VFS.SQLITE_OK;
		}

		if (this.useDirLocks && of.locked) {
			try {
				fs.rmdirSync?.(`${of.pathname}.lock`);
				dlog("jClose: removed lock", { lock: `${of.pathname}.lock` });
			} catch (e: any) {
				if (DEBUG)
					derr("jClose: unlock cleanup failed", {
						code: e?.code,
						msg: e?.message,
					});
			}
			of.locked = false;
		}

		try {
			fs.closeSync?.(of.fd);
		} catch (e: any) {
			derr("jClose: IOERR_CLOSE", {
				pathname: of.pathname,
				fd: of.fd,
				code: e?.code,
				msg: e?.message,
			});
			if (of.deleteOnClose) {
				try {
					fs.unlinkSync?.(of.pathname);
				} catch {
					/* ignore */
				}
			}
			this.mapIdToOpen.delete(fileId);
			return VFS.SQLITE_IOERR_CLOSE;
		}

		if (of.deleteOnClose) {
			try {
				fs.unlinkSync?.(of.pathname);
			} catch (e: any) {
				if (e?.code !== "ENOENT" && DEBUG)
					derr("jClose: deleteOnClose failed", {
						code: e?.code,
						msg: e?.message,
					});
			}
		}

		this.mapIdToOpen.delete(fileId);
		dlog("jClose ✓", { fileId });
		return VFS.SQLITE_OK;
	}

	jRead(fileId: number, pData: Uint8Array, iOffset: number): number {
		const fs = this.fs;
		const of = this.get(fileId);
		if (!of) {
			derr("jRead: IOERR_READ (not open)", { fileId });
			return VFS.SQLITE_IOERR_READ;
		}
		let n = 0;
		try {
			n = readSyncPortable(
				fs,
				of.fd,
				pData,
				0,
				pData.byteLength,
				iOffset
			);
		} catch (e: any) {
			derr("jRead: IOERR_READ", {
				pathname: of.pathname,
				off: iOffset,
				len: pData.byteLength,
				code: e?.code,
				msg: e?.message,
			});
			return VFS.SQLITE_IOERR_READ;
		}
		if (n < pData.byteLength) {
			pData.fill(0, n);
			dlog("jRead: SHORT_READ", {
				pathname: of.pathname,
				off: iOffset,
				req: pData.byteLength,
				got: n,
			});
			return VFS.SQLITE_IOERR_SHORT_READ;
		}
		dlog("jRead ✓", {
			pathname: of.pathname,
			off: iOffset,
			len: pData.byteLength,
		});
		return VFS.SQLITE_OK;
	}

	jWrite(fileId: number, pData: Uint8Array, iOffset: number): number {
		const fs = this.fs;
		const of = this.get(fileId);
		if (!of) {
			derr("jWrite: IOERR_WRITE (not open)", { fileId });
			return VFS.SQLITE_IOERR_WRITE;
		}
		try {
			const n = writeSyncPortable(
				fs,
				of.fd,
				pData,
				0,
				pData.byteLength,
				iOffset
			);
			if (n !== pData.byteLength) {
				derr("jWrite: IOERR_WRITE (short write)", {
					pathname: of.pathname,
					off: iOffset,
					req: pData.byteLength,
					wrote: n,
				});
				return VFS.SQLITE_IOERR_WRITE;
			}
			dlog("jWrite ✓", {
				pathname: of.pathname,
				off: iOffset,
				len: pData.byteLength,
			});
			return VFS.SQLITE_OK;
		} catch (e: any) {
			derr("jWrite: IOERR_WRITE", {
				pathname: of.pathname,
				off: iOffset,
				len: pData.byteLength,
				code: e?.code,
				msg: e?.message,
			});
			return VFS.SQLITE_IOERR_WRITE;
		}
	}

	jTruncate(fileId: number, iSize: number): number {
		const fs = this.fs;
		const of = this.get(fileId);
		if (!of) {
			derr("jTruncate: IOERR_TRUNCATE (not open)", { fileId });
			return VFS.SQLITE_IOERR_TRUNCATE;
		}
		try {
			fs.ftruncateSync?.(of.fd, iSize);
			dlog("jTruncate ✓", { pathname: of.pathname, size: iSize });
			return VFS.SQLITE_OK;
		} catch (e: any) {
			derr("jTruncate: IOERR_TRUNCATE", {
				pathname: of.pathname,
				size: iSize,
				code: e?.code,
				msg: e?.message,
			});
			return VFS.SQLITE_IOERR_TRUNCATE;
		}
	}

	jFileSize(fileId: number, pSize64: DataView): number {
		const fs = this.fs;
		const of = this.get(fileId);
		if (!of) {
			derr("jFileSize: IOERR_FSTAT (not open)", { fileId });
			return VFS.SQLITE_IOERR_FSTAT;
		}
		try {
			const st = fs.fstatSync?.(of.fd);
			if (!st) throw new Error("fstatSync unavailable");
			pSize64.setBigInt64(0, BigInt(st.size), true);
			dlog("jFileSize ✓", { pathname: of.pathname, size: st.size });
			return VFS.SQLITE_OK;
		} catch (e: any) {
			derr("jFileSize: IOERR_FSTAT", {
				pathname: of.pathname,
				msg: e?.message,
			});
			return VFS.SQLITE_IOERR_FSTAT;
		}
	}

	jDelete(name: string, _syncDir: number): number {
		const fs = this.fs;
		const pathname = this.resolveName(name);
		try {
			fs.unlinkSync?.(pathname);
			dlog("jDelete ✓", { pathname });
			return VFS.SQLITE_OK;
		} catch (e: any) {
			if (e?.code === "ENOENT") {
				dlog("jDelete ✓ (ENOENT)", { pathname });
				return VFS.SQLITE_OK;
			}
			derr("jDelete: IOERR_DELETE", {
				pathname,
				code: e?.code,
				msg: e?.message,
			});
			return VFS.SQLITE_IOERR_DELETE;
		}
	}

	jAccess(name: string, _flags: number, pResOut: DataView): number {
		const fs = this.fs;
		const pathname = this.resolveName(name);
		try {
			fs.accessSync?.(pathname, this.C.F_OK);
			pResOut.setInt32(0, 1, true);
			dlog("jAccess: exists", { pathname });
		} catch {
			pResOut.setInt32(0, 0, true);
			dlog("jAccess: missing", { pathname });
		}
		return VFS.SQLITE_OK;
	}

	// --- nice-to-haves ----------------------------------------------------------

	jRandomness(pOut: Uint8Array): number {
		this.randomBytes(pOut);
		dlog("jRandomness", { len: pOut.byteLength });
		return pOut.byteLength;
	}

	jSync(fileId: number, _flags: number): number {
		const fs = this.fs;
		const of = this.get(fileId);
		if (!of) {
			derr("jSync: IOERR_FSYNC (not open)", { fileId });
			return VFS.SQLITE_IOERR_FSYNC;
		}
		try {
			fs.fsyncSync?.(of.fd);
			dlog("jSync ✓", { pathname: of.pathname });
			return VFS.SQLITE_OK;
		} catch (e: any) {
			derr("jSync: IOERR_FSYNC", {
				pathname: of.pathname,
				msg: e?.message,
			});
			return VFS.SQLITE_IOERR_FSYNC;
		}
	}

	// Writes absolute resolved path into `out` (UTF-8).
	jFullPathname(name: string, out: Uint8Array): number {
		try {
			// We don't attempt canonicalization beyond base + name.
			const abs = this.resolveName(name);
			const enc = new TextEncoder().encode(abs);
			if (enc.byteLength >= out.byteLength) {
				dlog("jFullPathname: CANTOPEN (buffer too small)", {
					abs,
					need: enc.byteLength + 1,
					have: out.byteLength,
				});
				return VFS.SQLITE_CANTOPEN;
			}
			out.set(enc);
			if (enc.byteLength < out.byteLength) out[enc.byteLength] = 0;
			dlog("jFullPathname ✓", { abs });
			return VFS.SQLITE_OK;
		} catch (e: any) {
			derr("jFullPathname: CANTOPEN", { name, msg: e?.message });
			return VFS.SQLITE_CANTOPEN;
		}
	}

	jLock(fileId: number, _level: number): number {
		const fs = this.fs;
		const of = this.get(fileId);
		if (!of) {
			derr("jLock: IOERR_LOCK (not open)", { fileId });
			return VFS.SQLITE_IOERR_LOCK;
		}
		if (!this.useDirLocks) {
			of.locked = true; // in-process only
			dlog("jLock ✓ (in-process)", { path: of.pathname });
			return VFS.SQLITE_OK;
		}
		if (!of.locked) {
			try {
				fs.mkdirSync?.(`${of.pathname}.lock`);
				of.locked = true;
				dlog("jLock ✓", { lock: `${of.pathname}.lock` });
			} catch (e: any) {
				const rc =
					e?.code === "EEXIST"
						? VFS.SQLITE_BUSY
						: VFS.SQLITE_IOERR_LOCK;
				derr("jLock:", { rc, code: e?.code, msg: e?.message });
				return rc;
			}
		}
		return VFS.SQLITE_OK;
	}

	jUnlock(fileId: number, level: number): number {
		const fs = this.fs;
		const of = this.get(fileId);
		if (!of) {
			derr("jUnlock: IOERR_UNLOCK (not open)", { fileId });
			return VFS.SQLITE_IOERR_UNLOCK;
		}
		if (level === VFS.SQLITE_LOCK_NONE && of.locked) {
			if (!this.useDirLocks) {
				of.locked = false;
				dlog("jUnlock ✓ (in-process)", { path: of.pathname });
				return VFS.SQLITE_OK;
			}
			try {
				fs.rmdirSync?.(`${of.pathname}.lock`);
				dlog("jUnlock ✓", { lock: `${of.pathname}.lock` });
			} catch (e: any) {
				if (e?.code !== "ENOENT") {
					derr("jUnlock: IOERR_UNLOCK", {
						code: e?.code,
						msg: e?.message,
					});
					return VFS.SQLITE_IOERR_UNLOCK;
				}
				dlog("jUnlock ✓ (ENOENT)", { lock: `${of.pathname}.lock` });
			}
			of.locked = false;
		}
		return VFS.SQLITE_OK;
	}

	jCheckReservedLock(fileId: number, pResOut: DataView): number {
		const fs = this.fs;
		const of = this.get(fileId);
		if (!of) {
			pResOut.setInt32(0, 0, true);
			dlog("jCheckReservedLock: not open → 0", { fileId });
			return VFS.SQLITE_OK;
		}
		if (!this.useDirLocks) {
			pResOut.setInt32(0, of.locked ? 1 : 0, true);
			dlog("jCheckReservedLock (in-process) →", of.locked ? 1 : 0);
			return VFS.SQLITE_OK;
		}
		try {
			fs.accessSync?.(`${of.pathname}.lock`, this.C.F_OK);
			pResOut.setInt32(0, 1, true);
			dlog("jCheckReservedLock → 1", { lock: `${of.pathname}.lock` });
		} catch {
			pResOut.setInt32(0, 0, true);
			dlog("jCheckReservedLock → 0", { lock: `${of.pathname}.lock` });
		}
		return VFS.SQLITE_OK;
	}
}
