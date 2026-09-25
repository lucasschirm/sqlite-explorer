import type { RefObject } from "react";

/** Text input + inline error message, styled by the field's error state. */
export function NameFieldInput({
  name,
  error,
  inputRef,
  updateName,
  handleKeyDown,
  placeholder,
}: {
  name: string;
  error: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  updateName: (value: string) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => updateName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? "Name"}
        className={`mt-4 w-full px-3 py-2 text-sm border rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
          error ? "border-red-400" : "border-gray-200 focus:border-blue-400"
        }`}
      />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </>
  );
}
