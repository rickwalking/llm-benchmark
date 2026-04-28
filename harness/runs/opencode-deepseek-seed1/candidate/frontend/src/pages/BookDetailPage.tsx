import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError, type BookDetail } from '../api';
import { useApp } from '../context';
import CreateBookModal from '../components/CreateBookModal';

export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { selectedMember } = useApp();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadBook = () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api.books.get(id, selectedMember?.id)
      .then(setBook)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load book'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBook();
  }, [id, selectedMember?.id]);

  const handleBorrow = async () => {
    if (!selectedMember || !id) return;
    setActionError(null);
    try {
      await api.loans.borrow(selectedMember.id, id);
      loadBook();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Failed to borrow');
    }
  };

  const handleReserve = async () => {
    if (!selectedMember || !id) return;
    setActionError(null);
    try {
      await api.reservations.create(selectedMember.id, id);
      loadBook();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Failed to reserve');
    }
  };

  if (loading) {
    return <div className="loading"><span className="spinner" /> Loading book...</div>;
  }

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  if (!book) {
    return <div className="alert alert-error">Book not found</div>;
  }

  const qp = book.queue_position;

  return (
    <div>
      <Link to="/books" style={{ fontSize: '14px' }}>&larr; Back to catalog</Link>
      <h1 style={{ fontSize: '24px', marginTop: '12px', marginBottom: '4px' }}>{book.title}</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '20px' }}>
        by {book.author}
      </p>

      {actionError && <div className="alert alert-error">{actionError}</div>}

      <div className="detail-grid" style={{ marginBottom: '24px' }}>
        <div className="detail-item">
          <span>ISBN</span>
          <strong style={{ fontFamily: 'monospace' }}>{book.isbn}</strong>
        </div>
        <div className="detail-item">
          <span>Total Copies</span>
          <strong>{book.total_copies}</strong>
        </div>
        <div className="detail-item">
          <span>Available</span>
          <strong>{book.available_copies} of {book.total_copies}</strong>
        </div>
        <div className="detail-item">
          <span>Queue Depth</span>
          <strong>{book.queue_depth} waiting</strong>
        </div>
      </div>

      {selectedMember && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">Actions for {selectedMember.name}</div>

          {qp ? (
            <div style={{ marginBottom: '12px' }}>
              {qp.hasNotification ? (
                <div>
                  <span className="badge badge-warning">Notification active</span>
                  {' '}
                  Expires in{' '}
                  <span className="queue-countdown">
                    {qp.expiresIn != null
                      ? formatDuration(qp.expiresIn)
                      : '--'}
                  </span>
                </div>
              ) : (
                <div>
                  <span className="badge badge-info">Queue position: {qp.position}</span>
                  {' '}
                  of {book.queue_depth} waiting
                </div>
              )}
            </div>
          ) : book.available_copies === 0 ? (
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
              No copies available. Reserve to join the queue.
            </p>
          ) : null}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn-primary"
              onClick={handleBorrow}
              disabled={book.available_copies === 0 && (!qp || !qp.hasNotification)}
            >
              Borrow
            </button>
            <button
              className="btn-secondary"
              onClick={handleReserve}
            >
              Reserve
            </button>
          </div>
        </div>
      )}

      {!selectedMember && (
        <div className="alert alert-info">
          Select a member in the navigation bar to borrow or reserve this book.
        </div>
      )}

      <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
        Add New Book
      </button>

      {showCreateModal && (
        <CreateBookModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
