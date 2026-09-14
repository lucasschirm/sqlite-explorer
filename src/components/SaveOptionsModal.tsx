import { useEffect } from "react";

export interface SaveOptionsModalProps {
  /** Existing view name when updating. */
  viewName: string;
  projectViewCount: number;
  onSave: () => void;
  onCreateNew: () => void;
  onCancel: () => void;
}

/**
 * Save confirmation for an existing view: overwrite in place or fork the
 * current SQL into a brand-new named view. Mount only while open.
 */
export function SaveOptionsModal({
  viewName,
  projectViewCount,
  onSave,
  onCreateNew,
  onCancel,
}: SaveOptionsModalProps) {
  // Escape cancels.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/40 drawer-backdrop" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save view"
        className="modal-pop relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
      >
        <h2 className="text-base font-semibold text-gray-800">Save view</h2>
        <p className="text-xs text-gray-400 mt-1">
          Update “{viewName}” or create a new view from this SQL
          {projectViewCount > 0
            ? ` (project has ${projectViewCount} view${projectViewCount !== 1 ? "s" : ""})`
            : ""}
          .
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Save (update “{viewName}”)
          </button>
          <button
            onClick={onCreateNew}
            className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
          >
            Create a new one
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
