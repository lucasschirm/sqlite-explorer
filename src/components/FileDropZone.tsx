import { useRef, useState } from "react";

interface FileDropZoneProps {
  onPickFile: (file: File) => void;
  onDemo: () => void;
  isLoading: boolean;
}

export function FileDropZone({ onPickFile, onDemo, isLoading }: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    // Stop the event from reaching App's window-level drop listener, which
    // would otherwise start a second concurrent read of the same file.
    e.stopPropagation();
    dragDepth.current = 0;
    setIsDragOver(false);

    // Prefer the File System Access API (getAsFileSystemHandle) which gives
    // a real disk handle — this bypasses sandboxed FileReader limitations
    // that block reading large dropped files in Chromium.
    const item = e.dataTransfer.items?.[0] as
      | (DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemFileHandle | null> })
      | undefined;
    if (item?.getAsFileSystemHandle) {
      try {
        const handle = await item.getAsFileSystemHandle();
        if (handle && "getFile" in handle) {
          const file = await handle.getFile();
          if (file) {
            onPickFile(file);
            return;
          }
        }
      } catch (err) {
        console.warn("getAsFileSystemHandle failed, falling back to DataTransfer.files:", err);
      }
    }

    // Fallback: plain DataTransfer.files (may fail for very large files)
    const file = e.dataTransfer.files?.[0];
    if (file) onPickFile(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragOver(false);
    }
  };

  return (
    <div
      className="flex-1 relative flex items-center justify-center p-8"
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => fileInputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
    >
      {/* Full-zone drag indicator */}
      {isDragOver && (
        <div className="absolute inset-0 rounded-xl border-4 border-dashed border-blue-400 bg-blue-50/60 pointer-events-none" />
      )}

      <div
        className={`
          w-full max-w-lg cursor-pointer rounded-xl border-2 border-dashed
          transition-all duration-200 p-12 text-center select-none
          ${
            isDragOver
              ? "border-blue-500 bg-blue-50 scale-[1.02] shadow-lg"
              : "border-gray-300 bg-white hover:border-gray-400 hover:shadow-md"
          }
          ${isLoading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500">Loading database...</p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-5xl">🗄️</div>
            <p className="text-lg font-medium text-gray-700 mb-2">
              Drop a SQLite file anywhere on this screen
            </p>
            <p className="text-sm text-gray-400 mb-4">or click to browse</p>
            <p className="text-xs text-gray-300">
              Supports .sqlite, .db, .sqlite3 files — files are processed
              locally and never uploaded
            </p>
            <p className="text-xs text-emerald-500/80 mt-2">
              Multi-gigabyte files welcome — data streams from disk on demand,
              the whole file is never loaded into memory
            </p>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".sqlite,.db,.sqlite3,.db3"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPickFile(file);
            e.target.value = "";
          }}
          className="hidden"
        />
        {/* Demo database button — separate from the drop zone click handler */}
        <div
          className="mt-6"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            data-testid="load-demo"
            onClick={onDemo}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 disabled:opacity-50 rounded-lg transition-colors"
          >
            ⚡ Load demo database
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Loads a bundled sample database for testing
          </p>
        </div>
      </div>
    </div>
  );
}
