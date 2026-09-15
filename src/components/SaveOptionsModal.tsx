import { useEffect, useRef, useState } from "react";

export interface SaveOptionsModalProps {
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
  const [name, setName] = useState(viewName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Escape cancels; focus the input after the first paint.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(raf);
    };
  }, [onCancel]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    const validationError = validate?.(trimmed) ?? null;
    if (validationError) {
      setError(validationError);
      return;
    }
    onSave(trimmed);
  };

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
          Update this view in place or create a new one from this SQL.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="View name"
          className={`mt-4 w-full px-3 py-2 text-sm border rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
            error ? "border-red-400" : "border-gray-200 focus:border-blue-400"
          }`}
        />
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
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
      </div>
    </div>
  );
}
