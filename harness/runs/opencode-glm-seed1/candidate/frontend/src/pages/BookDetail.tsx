import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router';
import { api, type BookDetail as BookDetailType } from '../api';

export function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<BookDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [memberId, setMemberId] = useState('');
  const [reserveMsg, setReserveMsg] = useState('');
  const [searchParams] = useSearchParams();

  useEffect(() => {
    loadBook();
  }, [id]);

  async function loadBook() {
    if (!id) return;
    try {
      setLoading(true);
      const data = await api.books.get(id);
      setBook(data);
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load book');
    } finally {
      setLoading(false);
    }
  }

  async function handleReserve(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !memberId) return;
    try {
      await api.reservations.create(memberId, id);
      setReserveMsg('Reservation created successfully!');
      setMemberId('');
      loadBook();
    } catch (e: unknown) {
      setReserveMsg(e instanceof Error ? e.message : 'Failed to create reservation');
    }
  }

  const prefillMemberId = searchParams.get('member_id');

  if (loading) return <p>Loading book details&hellip;</p>;
  if (error && !book) return <div className="alert alert-danger">{error}</div>;
  if (!book) return <div className="empty-state"><p>Book not found.</p></div>;

  return (
    <div>
      <Link to="/books">&larr; Back to catalog</Link>
      <div className="card" style={{ marginTop: '1rem' }}>
        <h1>{book.title}</h1>
        <p style={{ color: 'var(--color-text-light)', fontSize: '0.95rem' }}>by {book.author}</p>
        <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>ISBN: {book.isbn}</p>

        <div style={{ marginTop: '1rem' }}>
          {book.available_copies > 0 ? (
            <span className="badge badge-success">{book.available_copies} of {book.total_copies} available</span>
          ) : (
            <span className="badge badge-danger">
              All copies on loan
              {book.reservation_queue_depth > 0 && ` — ${book.reservation_queue_depth} waiting`}
            </span>
          )}
        </div>

        {book.reservation_queue_depth > 0 && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
            {book.reservation_queue_depth} reservation{book.reservation_queue_depth !== 1 && 's'} in queue
          </p>
        )}

        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
          <h2>Reserve this book</h2>
          <form onSubmit={handleReserve} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="reserve-member">Member ID</label>
              <input
                id="reserve-member"
                value={memberId || prefillMemberId || ''}
                onChange={(e) => setMemberId(e.target.value)}
                placeholder="Enter member ID"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary">Reserve</button>
          </form>
          {reserveMsg && (
            <p style={{ marginTop: '0.5rem', color: reserveMsg.includes('success') ? 'var(--color-success)' : 'var(--color-danger)' }}>
              {reserveMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}