// Small file-reading helpers used before handing a file to the database
// worker. The database itself is never loaded into memory — SQLite reads
// pages from the file handle on demand (see lib/blobVfs.ts) — so only tiny
// byte ranges are ever read here.

/**
 * Read the first `length` bytes of a File (used for quick header checks).
 * A 16-byte peek works even for multi-GB files and files whose whole-file
 * reads the browser refuses (NotReadableError).
 */
export function peekFileBytes(file: File, length: number): Promise<Uint8Array> {
  const end = Math.min(length, file.size);
  if (end <= 0) return Promise.resolve(new Uint8Array(0));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file header"));
    };
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    try {
      reader.readAsArrayBuffer(file.slice(0, end));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
