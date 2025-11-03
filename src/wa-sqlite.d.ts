declare module "wa-sqlite/src/FacadeVFS.js" {
	import type * as VFS from "./VFS.js";

	/**
	 * Convenience base class for a JavaScript VFS implementation.
	 * Provides friendlier JavaScript wrappers around the C-level x* functions.
	 */
	export class FacadeVFS extends VFS.Base {
		/**
		 * @param {string} name
		 * @param {object} module
		 */
		constructor(name: string, module: object);

        isReady(): boolean | Promise<boolean>;

		/**
		 * Override to indicate which methods are asynchronous.
		 * @param {string} methodName
		 * @returns {boolean}
		 */
		hasAsyncMethod(methodName: string): boolean;

		/**
		 * Return the filename for a file id for use by mixins.
		 * @param {number} pFile
		 * @returns {string}
		 */
		getFilename(pFile: number): string;

		/**
		 * @param {string?} filename
		 * @param {number} pFile
		 * @param {number} flags
		 * @param {DataView} pOutFlags
		 * @returns {number|Promise<number>}
		 */
		jOpen(
			filename: string | null,
			pFile: number,
			flags: number,
			pOutFlags: DataView
		): number | Promise<number>;

		/**
		 * @param {string} filename
		 * @param {number} syncDir
		 * @returns {number|Promise<number>}
		 */
		jDelete(filename: string, syncDir: number): number | Promise<number>;

		/**
		 * @param {string} filename
		 * @param {number} flags
		 * @param {DataView} pResOut
		 * @returns {number|Promise<number>}
		 */
		jAccess(
			filename: string,
			flags: number,
			pResOut: DataView
		): number | Promise<number>;

		/**
		 * @param {string} filename
		 * @param {Uint8Array} zOut
		 * @returns {number|Promise<number>}
		 */
		jFullPathname(
			filename: string,
			zOut: Uint8Array
		): number | Promise<number>;

		/**
		 * @param {Uint8Array} zBuf
		 * @returns {number|Promise<number>}
		 */
		jGetLastError(zBuf: Uint8Array): number | Promise<number>;

		/**
		 * @param {number} pFile
		 * @returns {number|Promise<number>}
		 */
		jClose(pFile: number): number | Promise<number>;

		/**
		 * @param {number} pFile
		 * @param {Uint8Array} pData
		 * @param {number} iOffset
		 * @returns {number|Promise<number>}
		 */
		jRead(
			pFile: number,
			pData: Uint8Array,
			iOffset: number
		): number | Promise<number>;

		/**
		 * @param {number} pFile
		 * @param {Uint8Array} pData
		 * @param {number} iOffset
		 * @returns {number|Promise<number>}
		 */
		jWrite(
			pFile: number,
			pData: Uint8Array,
			iOffset: number
		): number | Promise<number>;

		/**
		 * @param {number} pFile
		 * @param {number} size
		 * @returns {number|Promise<number>}
		 */
		jTruncate(pFile: number, size: number): number | Promise<number>;

		/**
		 * @param {number} pFile
		 * @param {number} flags
		 * @returns {number|Promise<number>}
		 */
		jSync(pFile: number, flags: number): number | Promise<number>;

		/**
		 * @param {number} pFile
		 * @param {DataView} pSize
		 * @returns {number|Promise<number>}
		 */
		jFileSize(pFile: number, pSize: DataView): number | Promise<number>;

		/**
		 * @param {number} pFile
		 * @param {number} lockType
		 * @returns {number|Promise<number>}
		 */
		jLock(pFile: number, lockType: number): number | Promise<number>;

		/**
		 * @param {number} pFile
		 * @param {number} lockType
		 * @returns {number|Promise<number>}
		 */
		jUnlock(pFile: number, lockType: number): number | Promise<number>;

		/**
		 * @param {number} pFile
		 * @param {DataView} pResOut
		 * @returns {number|Promise<number>}
		 */
		jCheckReservedLock(
			pFile: number,
			pResOut: DataView
		): number | Promise<number>;

		/**
		 * @param {number} pFile
		 * @param {number} op
		 * @param {DataView} pArg
		 * @returns {number|Promise<number>}
		 */
		jFileControl(
			pFile: number,
			op: number,
			pArg: DataView
		): number | Promise<number>;

		/**
		 * @param {number} pFile
		 * @returns {number|Promise<number>}
		 */
		jSectorSize(pFile: number): number | Promise<number>;

		/**
		 * @param {number} pFile
		 * @returns {number|Promise<number>}
		 */
		jDeviceCharacteristics(pFile: number): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jOpen}.
		 * @param {number} pVfs
		 * @param {number} zName
		 * @param {number} pFile
		 * @param {number} flags
		 * @param {number} pOutFlags
		 * @returns {number|Promise<number>}
		 */
		xOpen(
			pVfs: number,
			zName: number,
			pFile: number,
			flags: number,
			pOutFlags: number
		): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jDelete}.
		 * @param {number} pVfs
		 * @param {number} zName
		 * @param {number} syncDir
		 * @returns {number|Promise<number>}
		 */
		xDelete(
			pVfs: number,
			zName: number,
			syncDir: number
		): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jAccess}.
		 * @param {number} pVfs
		 * @param {number} zName
		 * @param {number} flags
		 * @param {number} pResOut
		 * @returns {number|Promise<number>}
		 */
		xAccess(
			pVfs: number,
			zName: number,
			flags: number,
			pResOut: number
		): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jFullPathname}.
		 * @param {number} pVfs
		 * @param {number} zName
		 * @param {number} nOut
		 * @param {number} zOut
		 * @returns {number|Promise<number>}
		 */
		xFullPathname(
			pVfs: number,
			zName: number,
			nOut: number,
			zOut: number
		): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jGetLastError}.
		 * @param {number} pVfs
		 * @param {number} nBuf
		 * @param {number} zBuf
		 * @returns {number|Promise<number>}
		 */
		xGetLastError(
			pVfs: number,
			nBuf: number,
			zBuf: number
		): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jClose}.
		 * @param {number} pFile
		 * @returns {number|Promise<number>}
		 */
		xClose(pFile: number): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jRead}.
		 * @param {number} pFile
		 * @param {number} pData
		 * @param {number} iAmt
		 * @param {number} iOffsetLo
		 * @param {number} iOffsetHi
		 * @returns {number|Promise<number>}
		 */
		xRead(
			pFile: number,
			pData: number,
			iAmt: number,
			iOffsetLo: number,
			iOffsetHi: number
		): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jWrite}.
		 * @param {number} pFile
		 * @param {number} pData
		 * @param {number} iAmt
		 * @param {number} iOffsetLo
		 * @param {number} iOffsetHi
		 * @returns {number|Promise<number>}
		 */
		xWrite(
			pFile: number,
			pData: number,
			iAmt: number,
			iOffsetLo: number,
			iOffsetHi: number
		): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jTruncate}.
		 * @param {number} pFile
		 * @param {number} sizeLo
		 * @param {number} sizeHi
		 * @returns {number|Promise<number>}
		 */
		xTruncate(
			pFile: number,
			sizeLo: number,
			sizeHi: number
		): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jSync}.
		 * @param {number} pFile
		 * @param {number} flags
		 * @returns {number|Promise<number>}
		 */
		xSync(pFile: number, flags: number): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jFileSize}.
		 * @param {number} pFile
		 * @param {number} pSize
		 * @returns {number|Promise<number>}
		 */
		xFileSize(pFile: number, pSize: number): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jLock}.
		 * @param {number} pFile
		 * @param {number} lockType
		 * @returns {number|Promise<number>}
		 */
		xLock(pFile: number, lockType: number): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jUnlock}.
		 * @param {number} pFile
		 * @param {number} lockType
		 * @returns {number|Promise<number>}
		 */
		xUnlock(pFile: number, lockType: number): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jCheckReservedLock}.
		 * @param {number} pFile
		 * @param {number} pResOut
		 * @returns {number|Promise<number>}
		 */
		xCheckReservedLock(
			pFile: number,
			pResOut: number
		): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jFileControl}.
		 * @param {number} pFile
		 * @param {number} op
		 * @param {number} pArg
		 * @returns {number|Promise<number>}
		 */
		xFileControl(
			pFile: number,
			op: number,
			pArg: number
		): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jSectorSize}.
		 * @param {number} pFile
		 * @returns {number|Promise<number>}
		 */
		xSectorSize(pFile: number): number | Promise<number>;

		/**
		 * Low-level WASM-facing wrapper. **Do not override unless necessary;**
		 * prefer implementing {@link jDeviceCharacteristics}.
		 * @param {number} pFile
		 * @returns {number|Promise<number>}
		 */
		xDeviceCharacteristics(pFile: number): number | Promise<number>;
	}
}
