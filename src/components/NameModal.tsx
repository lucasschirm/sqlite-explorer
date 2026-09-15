import { useEffect, useRef } from "react";
import { ModalShell } from "./ModalShell";
import { NameFieldInput } from "./NameField";
import { useNameField } from "../hooks/useNameField";

export interface NameModalProps {
  title: string;
  /** Optional helper line under the title. */
  description?: string | null;
  /** Prefill value for the input. */
  initialValue?: string;
  confirmLabel?: string;
  /**
   * Asynchronous name suggestion (e.g. AI-generated). Prefills the input
   * unless the user has already typed something.
   */
  suggestion?: string;
  /** Validate the trimmed name; return an error message or null when valid. */
  validate?: (name: string) => string | null;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

/**
 * Modal with a single text input and Save/Cancel buttons. Mount it only
 * while open (`{open && <NameModal … />}`); Escape cancels.
 */
export function NameModal({
  title,
  description,
  initialValue = "",
  confirmLabel = "Save",
  suggestion,
  validate,
  onConfirm,
  onCancel,
}: NameModalProps) {
  // Once the user types, the async suggestion must not clobber their text.
  const touchedRef = useRef(false);
  const { name, error, inputRef, updateName, submit, handleKeyDown } = useNameField({
    initialName: initialValue,
    validate,
    onConfirm,
  });

  // Late-arriving suggestion prefills the field (until the user has typed).
  useEffect(() => {
    if (!suggestion || touchedRef.current) return;
    updateName(suggestion);
  }, [suggestion, updateName]);

  return (
    <ModalShell title={title} description={description} onCancel={onCancel}>
      <NameFieldInput
        name={name}
        error={error}
        inputRef={inputRef}
        updateName={(value) => {
          touchedRef.current = true;
          updateName(value);
        }}
        handleKeyDown={handleKeyDown}
      />
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
