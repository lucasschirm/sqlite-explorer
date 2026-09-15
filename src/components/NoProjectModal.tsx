import { useEffect } from "react";

export interface NoProjectModalProps {
  onCreateProject: () => void;
  onCancel: () => void;
}

/**
 * Shown when the user tries to save a view with no project open: invites
 * them to open or create one. "Create project" opens the create modal.
 */
export function NoProjectModal({ onCreateProject, onCancel }: NoProjectModalProps) {
  // Escape dismisses.
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
        aria-label="No project open"
        className="modal-pop relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
      >
        <h2 className="text-base font-semibold text-gray-800">No project open</h2>
        <p className="text-sm text-gray-500 mt-2">
          Open or create a new project so you can save views.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            OK
          </button>
          <button
            onClick={onCreateProject}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Create project
          </button>
        </div>
      </div>
    </div>
  );
}
