export function Loading() {
  return (
    <div className="loading" role="status" aria-label="Loading">
      <div className="loading-spinner"></div>
      <p>Loading...</p>
    </div>
  );
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-message" role="alert">
      <p>❌ {message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary">
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <p>{message}</p>
      {action}
    </div>
  );
}
