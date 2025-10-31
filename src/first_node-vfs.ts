import type { Stats } from "fs";
import fs from "fs";
import SQLiteVFS from "wa-sqlite/src/VFS.js";

interface PathLike {
	dirname(path: string): string;
}

interface SQLiteVFSDeps {
	fs: typeof fs;
	path: PathLike;
	_fd: (fileId: number) => number;
	_path: (fileId: number) => string;
	_isLocked: (fileId: number) => boolean;
	_setLocked: (fileId: number, locked: boolean) => void;
	SQLITE_OK: number;
	SQLITE_CANTOPEN: number;
	SQLITE_BUSY: number;
	SQLITE_IOERR_WRITE: number;
	SQLITE_IOERR_FSYNC: number;
	SQLITE_IOERR_CLOSE: number;
	SQLITE_IOERR_READ: number;
	SQLITE_IOERR_SHORT_READ: number;
	SQLITE_IOERR_DELETE: number;
	SQLITE_IOERR_TRUNCATE: number;
	SQLITE_IOERR_FSTAT: number;
	SQLITE_IOERR_LOCK: number;
	SQLITE_IOERR_UNLOCK: number;
	SQLITE_ACCESS_READWRITE: number;
	SQLITE_ACCESS_READ: number;
	SQLITE_LOCK_NONE: number;
	SQLITE_OPEN_EXCLUSIVE: number;
	SQLITE_OPEN_CREATE: number;
	SQLITE_OPEN_READONLY: number;
	SQLITE_OPEN_READWRITE: number;
	SQLITE_NOTFOUND: number;
}

interface SQLiteVFS {
	mxPathName?: number;
	close(): void | Promise<void>;
	isReady(): boolean | Promise<boolean>;
	xClose(fileId: number): number;
	xRead(fileId: number, pData: Uint8Array, iOffset: number): number;
	xWrite(fileId: number, pData: Uint8Array, iOffset: number): number;
	xTruncate(fileId: number, iSize: number): number;
	xSync(fileId: number, flags: number): number;
	xFileSize(fileId: number, pSize64: DataView): number;
	xLock(fileId: number, flags: number): number;
	xUnlock(fileId: number, flags: number): number;
	xCheckReservedLock(fileId: number, pResOut: DataView): number;
	xFileControl(fileId: number, flags: number, pOut: DataView): number;
	xDeviceCharacteristics(fileId: number): number;
	xOpen(
		name: string | null,
		fileId: number,
		flags: number,
		pOutFlags: DataView
	): number;
	xDelete(name: string, syncDir: number): number;
	xAccess(name: string, flags: number, pResOut: DataView): number;
}

export function createNodeVFS(deps: SQLiteVFSDeps): SQLiteVFS {
	const {
		fs,
		path,
		_fd,
		_path,
		_isLocked,
		_setLocked,
		SQLITE_OK,
		SQLITE_CANTOPEN,
		SQLITE_BUSY,
		SQLITE_IOERR_WRITE,
		SQLITE_IOERR_FSYNC,
		SQLITE_IOERR_CLOSE,
		SQLITE_IOERR_READ,
		SQLITE_IOERR_SHORT_READ,
		SQLITE_IOERR_DELETE,
		SQLITE_IOERR_TRUNCATE,
		SQLITE_IOERR_FSTAT,
		SQLITE_IOERR_LOCK,
		SQLITE_IOERR_UNLOCK,
		SQLITE_ACCESS_READWRITE,
		SQLITE_ACCESS_READ,
		SQLITE_LOCK_NONE,
		SQLITE_OPEN_EXCLUSIVE,
		SQLITE_OPEN_CREATE,
		SQLITE_OPEN_READONLY,
		SQLITE_OPEN_READWRITE,
		SQLITE_NOTFOUND,
	} = deps;

	return {
		mxPathName: process.platform === "win32" ? 260 : 4096,

		close() {},

		isReady() {
			return true;
		},

		xClose(fileId: number): number {
			_setLocked(fileId, false);
			try {
				fs.closeSync(_fd(fileId));
			} catch {
				return SQLITE_IOERR_CLOSE;
			}
			return SQLITE_OK;
		},

		xRead(fileId: number, pData: Uint8Array, iOffset: number): number {
			let bytesRead: number;
			try {
				bytesRead = fs.readSync(
					_fd(fileId),
					pData,
					0,
					pData.length,
					iOffset
				);
			} catch {
				return SQLITE_IOERR_READ;
			}
			if (bytesRead === pData.length) {
				return SQLITE_OK;
			} else if (bytesRead >= 0) {
				if (bytesRead < pData.length) {
					try {
						pData.fill(0, bytesRead);
					} catch {
						return SQLITE_IOERR_READ;
					}
				}
				return SQLITE_IOERR_SHORT_READ;
			}
			return SQLITE_IOERR_READ;
		},

		xWrite(fileId: number, pData: Uint8Array, iOffset: number): number {
			try {
				const bytesWritten = fs.writeSync(
					_fd(fileId),
					pData,
					0,
					pData.length,
					iOffset
				);
				return bytesWritten !== pData.length
					? SQLITE_IOERR_WRITE
					: SQLITE_OK;
			} catch {
				return SQLITE_IOERR_WRITE;
			}
		},

		xTruncate(fileId: number, iSize: number): number {
			try {
				fs.ftruncateSync(_fd(fileId), iSize);
			} catch {
				return SQLITE_IOERR_TRUNCATE;
			}
			return SQLITE_OK;
		},

		xSync(fileId: number, flags: number): number {
			try {
				fs.fsyncSync(_fd(fileId));
			} catch {
				return SQLITE_IOERR_FSYNC;
			}
			return SQLITE_OK;
		},

		xFileSize(fileId: number, pSize64: DataView): number {
			try {
				const size = fs.fstatSync(_fd(fileId)).size;
				pSize64.setBigInt64(0, BigInt(size), true);
			} catch {
				return SQLITE_IOERR_FSTAT;
			}
			return SQLITE_OK;
		},

		xLock(fileId: number, level: number): number {
			if (!_isLocked(fileId)) {
				try {
					fs.mkdirSync(`${_path(fileId)}.lock`);
				} catch (err: any) {
					return err.code === "EEXIST"
						? SQLITE_BUSY
						: SQLITE_IOERR_LOCK;
				}
				_setLocked(fileId, true);
			}
			return SQLITE_OK;
		},

		xUnlock(fileId: number, level: number): number {
			if (level === SQLITE_LOCK_NONE && _isLocked(fileId)) {
				try {
					fs.rmdirSync(`${_path(fileId)}.lock`);
				} catch (err: any) {
					if (err.code !== "ENOENT") return SQLITE_IOERR_UNLOCK;
				}
				_setLocked(fileId, false);
			}
			return SQLITE_OK;
		},

		xCheckReservedLock(fileId: number, pResOut: DataView): number {
			try {
				fs.accessSync(`${_path(fileId)}.lock`, fs.constants.F_OK);
				pResOut.setInt32(0, 1, true);
			} catch {
				pResOut.setInt32(0, 0, true);
			}
			return SQLITE_OK;
		},

		xFileControl(fileId: number, flags: number, pOut: DataView): number {
			return SQLITE_NOTFOUND;
		},

		xDeviceCharacteristics(fileId: number): number {
			return 0;
		},

		xOpen(
			name: string | null,
			fileId: number,
			flags: number,
			pOutFlags: DataView
		): number {
			if (!name) return SQLITE_CANTOPEN;

			let oflags = 0;
			if (flags & SQLITE_OPEN_EXCLUSIVE) oflags |= fs.constants.O_EXCL;
			if (flags & SQLITE_OPEN_CREATE) oflags |= fs.constants.O_CREAT;
			if (flags & SQLITE_OPEN_READONLY) oflags |= fs.constants.O_RDONLY;
			if (flags & SQLITE_OPEN_READWRITE) oflags |= fs.constants.O_RDWR;

			try {
				const fd = fs.openSync(name, oflags, 0o666);
				// Store fd mapping for fileId (implementation specific to your binding)
				return SQLITE_OK;
			} catch {
				return SQLITE_CANTOPEN;
			}
		},

		xDelete(name: string, syncDir: number): number {
			try {
				fs.unlinkSync(name);
			} catch (err: any) {
				if (err.code !== "ENOENT") return SQLITE_IOERR_DELETE;
			}
			if (syncDir) {
				let fd = -1;
				try {
					fd = fs.openSync(path.dirname(name), fs.constants.O_RDONLY);
					fs.fsyncSync(fd);
				} catch {
					return SQLITE_IOERR_FSYNC;
				} finally {
					try {
						if (fd !== -1) fs.closeSync(fd);
					} catch {
						return SQLITE_IOERR_FSYNC;
					}
				}
			}
			return SQLITE_OK;
		},

		xAccess(name: string, flags: number, pResOut: DataView): number {
			let aflags = fs.constants.F_OK;
			if (flags === SQLITE_ACCESS_READWRITE) {
				aflags = fs.constants.R_OK | fs.constants.W_OK;
			}
			if (flags === SQLITE_ACCESS_READ) {
				aflags = fs.constants.R_OK;
			}
			try {
				fs.accessSync(name, aflags);
				pResOut.setInt32(0, 1, true);
			} catch {
				pResOut.setInt32(0, 0, true);
			}
			return SQLITE_OK;
		},
	};
}
