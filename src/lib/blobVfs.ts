// Read-only VFS that serves SQLite pages directly from a source: either a
// Blob (a File is a Blob) or an HTTP URL that supports Range requests (used
// by the `slitex` CLI, which streams the file from a local server). This is
// what makes multi-gigabyte databases work: SQLite reads only the 4 KiB pages
// a query touches, so a 2.5 GB file uses a few MB of memory instead of
// requiring the whole file to be loaded into an ArrayBuffer (which browsers
// cap at ~2 GB — the failure this replaces).
//
// Must run inside a Worker: xRead is synchronous (SQLite's C API is sync) and
// both FileReaderSync — which performs the sync Blob reads — and synchronous
// XMLHttpRequest (used for HTTP range reads) only exist in workers.
import * as SQLite from "wa-sqlite";

interface OpenEntry {
  name: string;
  /** Registered source blob (main database file). Null when url is set or for temp files. */
  blob: Blob | null;
  /** HTTP URL to read via Range requests (slitex CLI mode). Null when blob is set. */
  url: string | null;
  /** Known byte size for url-backed entries (fetched once via HEAD). */
  fileSize: number | null;
  /** In-memory backing store for writable temp files (sorts, temp tables). */
  temp: { data: Uint8Array; size: number } | null;
}

/**
 * Implements the VFS shape wa-sqlite's runtime glue calls: plain Uint8Array
 * buffers, numeric offsets, DataView out-params. The package's `Base` class
 * ships typings that disagree with its own runtime, so we implement the
 * contract directly instead of extending it.
 */
export class BlobVFS {
  name = "blob-vfs";
  mxPathName = 4096;

  /** Registered sources, keyed by the path SQLite was asked to open. */
  private mapNameToSource = new Map<string, Blob | string>();
  /** Known sizes for url-backed sources, filled by registerRemote. */
  private mapNameToSize = new Map<string, number>();
  /** Open file entries, keyed by the sqlite3_file pointer id. */
  private mapIdToEntry = new Map<number, OpenEntry>();
  private syncReader = new FileReaderSync();

  /** Make a blob available as a database file for open_v2(name). */
  registerBlob(name: string, blob: Blob): void {
    this.mapNameToSource.set(name, blob);
  }

  /**
   * Make an HTTP URL (supporting Range requests) available as a database
   * file. Probes the size once with a synchronous HEAD so xFileSize can
   * answer without a round-trip (must run inside the worker).
   */
  registerRemote(name: string, url: string): void {
    this.mapNameToSource.set(name, url);
    const xhr = new XMLHttpRequest();
    xhr.open("HEAD", url, false);
    try {
      xhr.send(null);
    } catch (err) {
      console.error(`BlobVFS: HEAD request for ${url} failed:`, err);
      return;
    }
    const len = Number(xhr.getResponseHeader("Content-Length"));
    if (xhr.status === 200 && Number.isFinite(len) && len > 0) {
      this.mapNameToSize.set(name, len);
    }
  }

  /** Drop all registered sources (called before opening a new database). */
  clearBlobs(): void {
    this.mapNameToSource.clear();
  }

  xOpen(name: string | null, fileId: number, flags: number, pOutFlags: DataView): number {
    try {
      const path = name ?? `__temp_${fileId}`;
      const source = this.mapNameToSource.get(path);
      if (source) {
        // The main database file: serve pages straight from the blob or URL.
        this.mapIdToEntry.set(fileId, {
          name: path,
          blob: source instanceof Blob ? source : null,
          url: typeof source === "string" ? source : null,
          fileSize: typeof source === "string" ? (this.mapNameToSize.get(path) ?? null) : null,
          temp: null,
        });
        pOutFlags.setInt32(0, SQLite.SQLITE_OPEN_READONLY, true);
        return SQLite.SQLITE_OK;
      }

      // Unknown file SQLite wants to create (temp database / journal for
      // sorts and temp tables): back it with growable in-memory storage.
      if (flags & SQLite.SQLITE_OPEN_CREATE) {
        this.mapIdToEntry.set(fileId, { name: path, blob: null, url: null, fileSize: null, temp: { data: new Uint8Array(0), size: 0 } });
        pOutFlags.setInt32(0, flags, true);
        return SQLite.SQLITE_OK;
      }

      // e.g. a missing -wal / -journal file is normal (SQLITE_CANTOPEN lets
      // SQLite proceed with journal-mode databases).
      return SQLite.SQLITE_CANTOPEN;
    } catch (err) {
      console.error("BlobVFS.xOpen failed:", err);
      return SQLite.SQLITE_IOERR;
    }
  }

  xClose(fileId: number): number {
    this.mapIdToEntry.delete(fileId);
    return SQLite.SQLITE_OK;
  }

  xRead(fileId: number, pData: Uint8Array, iOffset: number): number {
    const entry = this.mapIdToEntry.get(fileId);
    if (!entry) return SQLite.SQLITE_IOERR;

    try {
      let bytes: Uint8Array;
      if (entry.temp) {
        bytes = entry.temp.data.subarray(iOffset, iOffset + pData.byteLength);
      } else if (entry.url) {
        bytes = this.httpRangeRead(entry.url, iOffset, pData.byteLength);
      } else {
        const size = entry.blob!.size;
        const start = Math.min(iOffset, size);
        const end = Math.min(iOffset + pData.byteLength, size);
        const n = end - start;
        if (n > 0) {
          bytes = new Uint8Array(this.syncReader.readAsArrayBuffer(entry.blob!.slice(start, end)));
        } else {
          bytes = new Uint8Array(0);
        }
      }

      const n = Math.min(bytes.byteLength, pData.byteLength);
      pData.set(n === bytes.byteLength ? bytes : bytes.subarray(0, n));
      if (!entry.temp) this.patchWalHeader(iOffset, pData);
      if (n < pData.byteLength) {
        // Zero the tail and report a short read, per SQLite's contract.
        pData.fill(0, n);
        return SQLite.SQLITE_IOERR_SHORT_READ;
      }
      return SQLite.SQLITE_OK;
    } catch (err) {
      console.error(`BlobVFS: read of ${pData.byteLength} bytes at offset ${iOffset} from "${entry.name}" failed:`, err);
      return SQLite.SQLITE_IOERR;
    }
  }

  /**
   * Synchronous HTTP range read against the slitex server. Only legal inside
   * a worker — this is the HTTP equivalent of the FileReaderSync blob read.
   */
  private httpRangeRead(url: string, offset: number, length: number): Uint8Array {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.overrideMimeType("text/plain; charset=x-user-defined");
    try {
      xhr.setRequestHeader("Range", `bytes=${offset}-${offset + length - 1}`);
      xhr.send(null);
    } catch (err) {
      console.error(`BlobVFS: range request for ${url} bytes ${offset}..${offset + length - 1} failed:`, err);
      throw err;
    }
    // 206 Partial Content is the normal success; some servers ignore Range
    // and return 200 with the whole body — slice out what was asked for.
    if (xhr.status !== 206 && xhr.status !== 200) {
      throw new Error(`HTTP ${xhr.status} reading ${url} (range ${offset}-${offset + length - 1})`);
    }
    const buffer = xhr.response as ArrayBuffer;
    const bytes = new Uint8Array(buffer);
    return xhr.status === 200 && bytes.byteLength > length ? bytes.subarray(offset, offset + length) : bytes;
  }

  /**
   * Present WAL-mode databases (header bytes 18/19 = 2) as legacy-mode
   * snapshots (1). SQLite requires -wal and -shm side files for WAL mode,
   * which a dropped/picked single file cannot provide — without this, opening
   * a WAL database fails with SQLITE_CANTOPEN. Reading it as a plain legacy
   * file shows the last checkpointed state, which is the best a read-only
   * viewer without the side files can do. Applied on every header read so
   * SQLite always sees a consistent view.
   */
  private patchWalHeader(readStart: number, data: Uint8Array): void {
    for (let i = 0; i < data.byteLength; i++) {
      const fileOffset = readStart + i;
      if ((fileOffset === 18 || fileOffset === 19) && data[i] === 2) {
        data[i] = 1;
      }
    }
  }

  xWrite(fileId: number, pData: Uint8Array, iOffset: number): number {
    const entry = this.mapIdToEntry.get(fileId);
    if (!entry) return SQLite.SQLITE_IOERR;

    // Writes to the main database file are rejected — this viewer is read-only.
    if (!entry.temp) return SQLite.SQLITE_READONLY;

    try {
      const end = iOffset + pData.byteLength;
      if (end > entry.temp.data.byteLength) {
        const grown = new Uint8Array(Math.max(end, entry.temp.data.byteLength * 2, 1024));
        grown.set(entry.temp.data);
        entry.temp.data = grown;
      }
      entry.temp.data.set(pData, iOffset);
      entry.temp.size = Math.max(entry.temp.size, end);
      return SQLite.SQLITE_OK;
    } catch (err) {
      console.error("BlobVFS.xWrite failed:", err);
      return SQLite.SQLITE_IOERR;
    }
  }

  xTruncate(fileId: number, iSize: number): number {
    const entry = this.mapIdToEntry.get(fileId);
    if (!entry) return SQLite.SQLITE_IOERR;
    if (entry.temp) {
      entry.temp.size = Math.min(entry.temp.size, iSize);
      return SQLite.SQLITE_OK;
    }
    return SQLite.SQLITE_READONLY;
  }

  xFileSize(fileId: number, pSize64: DataView): number {
    const entry = this.mapIdToEntry.get(fileId);
    if (!entry) return SQLite.SQLITE_IOERR;
    const size = entry.temp ? entry.temp.size : (entry.blob?.size ?? entry.fileSize!);
    pSize64.setBigInt64(0, BigInt(size), true);
    return SQLite.SQLITE_OK;
  }

  xDelete(_name: string, _syncDir: number): number {
    // Only temp files created by this VFS live here; main db blobs are
    // managed by clearBlobs().
    return SQLite.SQLITE_OK;
  }

  xAccess(name: string, _flags: number, pResOut: DataView): number {
    pResOut.setInt32(0, this.mapNameToSource.has(name) ? 1 : 0, true);
    return SQLite.SQLITE_OK;
  }

  xDeviceCharacteristics(_fileId: number): number {
    return 0;
  }

  xSectorSize(_fileId: number): number {
    return 512;
  }

  // No-op defaults required by the SQLiteVFS contract but unused by this
  // read-only viewer.
  xSync(_fileId: number, _flags: number): number {
    return SQLite.SQLITE_OK;
  }

  xLock(_fileId: number, _flags: number): number {
    return SQLite.SQLITE_OK;
  }

  xUnlock(_fileId: number, _flags: number): number {
    return SQLite.SQLITE_OK;
  }

  xCheckReservedLock(_fileId: number, pResOut: DataView): number {
    pResOut.setInt32(0, 0, true);
    return SQLite.SQLITE_OK;
  }

  xFileControl(_fileId: number, _op: number, _pArg: DataView): number {
    return SQLite.SQLITE_NOTFOUND;
  }
}
