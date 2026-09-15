import { ModalShell } from "./ModalShell";
import { NameFieldInput } from "./NameField";
import { useNameField } from "../hooks/useNameField";

interface SaveOptionsModalProps {
  /** Current stored name of the view being updated. */
  viewName: string;
  onSave: (name: string) => void;
  onCreateNew: () => void;
  onCancel: () => void;
  /** Validate the edited name; return an error message or null when valid. */
  validate?: (name: string) => string | null;
}

/**
 * Save confirmation for an existing view: rename/update it in place or fork
 * the current SQL into a brand-new named view. Mount only while open.
 */
export function SaveOptionsModal({
  viewName,
  onSave,
  onCreateNew,
  onCancel,
  validate,
}: SaveOptionsModalProps) {
  const { name, error, inputRef, updateName, submit, handleKeyDown } = useNameField({
    initialName: viewName,
    validate,
    onConfirm: onSave,
  });

  return (
    <ModalShell
      title="Save view"
      description="Update this view in place or create a new one from this SQL."
      onCancel={onCancel}
    >
      <NameFieldInput
        name={name}
        error={error}
        inputRef={inputRef}
        updateName={updateName}
        handleKeyDown={handleKeyDown}
        placeholder="View name"
      />
      <div className="mt-5 flex flex-col gap-2">
        <button
          onClick={submit}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Save
        </button>
        <button
          onClick={onCreateNew}
          className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
        >
          Create new view
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </ModalShell>
  );
}
