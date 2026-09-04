interface LoadingOverlayProps {
  visible: boolean;
  message: string;
  detail?: string | null;
  indeterminate?: boolean;
  progress?: number; // 0..1, used when not indeterminate
}

export function LoadingOverlay({
  visible,
  message,
  detail,
  indeterminate = false,
  progress,
}: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 bg-white rounded-2xl shadow-2xl px-10 py-8 min-w-[320px] max-w-[90vw]">
        {indeterminate || progress == null ? (
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="w-12 h-12 rounded-full border-4 border-gray-200 flex items-center justify-center">
            <span className="text-sm font-semibold text-blue-600">
              {Math.round(progress * 100)}%
            </span>
          </div>
        )}
        <div className="text-center">
          <p className="text-sm font-medium text-gray-800">{message}</p>
          {detail && (
            <p className="text-xs text-gray-400 mt-1 font-mono">{detail}</p>
          )}
        </div>
        {!indeterminate && progress != null && (
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-150"
              style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
