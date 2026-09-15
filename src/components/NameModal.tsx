import { useEffect, useRef, useState } from "react";

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
 * Minimal centered modal with a single text input and Save/Cancel buttons.
 * Mount it only while open (`{open && <NameModal … />}`); Escape cancels.
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
  const [name, setName] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Once the user types, the async suggestion must not clobber their text.
  const touchedRef = useRef(false);

  // Late-arriving suggestion prefills the field (until the user has typed).
  useEffect(() => {
    if (!suggestion || touchedRef.current) return;
    setName(suggestion);
    setError(null);
  }, [suggestion]);

  // Escape cancels; focus the input after the first paint.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
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
    onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/40 drawer-backdrop" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal-pop relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
      >
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => {
            touchedRef.current = true;
            setName(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Name"
          className={`mt-4 w-full px-3 py-2 text-sm border rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
            error ? "border-red-400" : "border-gray-200 focus:border-blue-400"
          }`}
        />
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
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
      </div>
    </div>
  );
}
