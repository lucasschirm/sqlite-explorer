import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

export interface UseNameFieldOptions {
  /** Starting text for the input. */
  initialName: string;
  /** Validate the trimmed name; return an error message or null when valid. */
  validate?: (name: string) => string | null;
  /** Called with the trimmed name once it passes required + validate checks. */
  onConfirm: (name: string) => void;
}

/**
 * Shared state and submit logic for the two naming modals: trimmed-name
 * submission with a required check and an optional duplicate-name check.
 * Single responsibility — presentation lives in `NameFieldInput`.
 */
export function useNameField({ initialName, validate, onConfirm }: UseNameFieldOptions) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus (and select, when there's prefilled text) after the first paint.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Stable: setError(null) is unconditional, so no state dependency.
  const updateName = useCallback((value: string) => {
    setName(value);
    setError(null);
  }, []);

  const submit = useCallback(() => {
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
  }, [name, validate, onConfirm]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") submit();
    },
    [submit]
  );

  return { name, error, inputRef, updateName, submit, handleKeyDown };
}
