import { ModalShell } from "./ModalShell";

interface NoProjectModalProps {
  onCreateProject: () => void;
  onCancel: () => void;
}

/**
 * Shown when the user tries to save a view with no project open: invites
 * them to open or create one. "Create project" opens the create modal.
 */
export function NoProjectModal({ onCreateProject, onCancel }: NoProjectModalProps) {
  return (
    <ModalShell
      title="No project open"
      description="Open or create a new project so you can save views."
      onCancel={onCancel}
    >
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
    </ModalShell>
  );
}
