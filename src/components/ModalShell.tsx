import { useEffect, type ReactNode } from "react";

export interface ModalShellProps {
  /** Dialog title; also used as the accessible name. */
  title: string;
  /** Helper line under the title. */
  description?: string | null;
  onCancel: () => void;
  children: ReactNode;
}

/**
 * Shared centered-dialog frame: dimmed backdrop (click cancels), Escape
 * cancels, and the pop-in animation. Children render below the title.
 */
export function ModalShell({ title, description, onCancel, children }: ModalShellProps) {
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
        aria-label={title}
        className="modal-pop relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
      >
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
        {children}
      </div>
    </div>
  );
}
