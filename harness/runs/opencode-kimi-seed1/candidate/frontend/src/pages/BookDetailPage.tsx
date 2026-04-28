import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useFetch, useMutation } from '../hooks/useApi';
import { useSelectedMember } from '../contexts/MemberContext';
import type { BookWithQueue, Reservation } from '../types';
import { Loading, ErrorMessage, EmptyState } from '../components/Status';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

function formatTimeRemaining(expiresAt: string): string {
  const expires = new Date(expiresAt).getTime();
  const now = Date.now();
  const diff = expires - now;

  if (diff <= 0) return 'Expired';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedMember } = useSelectedMember();
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);

  const { data: book, loading, error, refetch } = useFetch<BookWithQueue>(`/api/books/${id}`);
  const { data: reservations } = useFetch<Array<{ member_id: string; status: string; expires_at: string | null }>>(
    selectedMember && id ? `/api/books/${id}/reservations` : null
  );

  const { mutate: reserve, loading: reserving } = useMutation<Reservation, { member_id: string; book_id: string }>(
    '/api/reservations',
    {
      onSuccess: () => {
        setShowReserveModal(false);
        setReserveError(null);
        refetch();
      },
      onError: (err) => setReserveError(err)
    }
  );

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;
  if (!book) return <EmptyState message="Book not found" />;

  const isAvailable = book.available_copies > 0;

  // Find member's reservation status
  let memberReservationStatus: { status: string; expires_at: string | null } | null = null;
  if (selectedMember && reservations) {
    const memberRes = reservations.find(r => r.member_id === selectedMember.id);
    if (memberRes) {
      memberReservationStatus = memberRes;
    }
  }

  const hasNotifiedReservation = memberReservationStatus?.status === 'notified';

  async function handleReserve() {
    if (!selectedMember || !id) return;
    setReserveError(null);
    await reserve({ member_id: selectedMember.id, book_id: id });
  }

  return (
    <div className="page">
      <Link to="/books" className="back-link">← Back to catalog</Link>

      <div className="book-detail">
        <h1>{book.title}</h1>
        <p className="book-author">by {book.author}</p>
        <p className="book-isbn">ISBN: {book.isbn}</p>

        <div className="book-stats">
          <div className="stat">
            <span className="stat-label">Total copies:</span>
            <span className="stat-value">{book.total_copies}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Available:</span>
            <span className={`stat-value ${isAvailable ? 'available' : 'unavailable'}`}>
              {book.available_copies}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">In queue:</span>
            <span className="stat-value">{book.queue_depth}</span>
          </div>
        </div>

        {selectedMember && (
          <div className="member-reservation-status">
            {memberReservationStatus ? (
              <div className="reservation-info">
                {hasNotifiedReservation && memberReservationStatus.expires_at ? (
                  <p className="notification-alert">
                    ✅ You have a notification! Expires in: {formatTimeRemaining(memberReservationStatus.expires_at)}
                  </p>
                ) : (
                  <p>You are in the reservation queue.</p>
                )}
              </div>
            ) : (
              !isAvailable && (
                <Button
                  onClick={() => setShowReserveModal(true)}
                  disabled={!selectedMember}
                >
                  Reserve this book
                </Button>
              )
            )}
          </div>
        )}

        {!selectedMember && (
          <p className="hint">
            <Link to="/members">Select a member</Link> to reserve or check out this book.
          </p>
        )}

        {isAvailable && selectedMember && (
          <Button onClick={() => navigate('/checkout')}>
            Proceed to Checkout
          </Button>
        )}
      </div>

      <Modal
        isOpen={showReserveModal}
        onClose={() => setShowReserveModal(false)}
        title="Confirm Reservation"
      >
        <p>
          Reserve <strong>{book.title}</strong> for <strong>{selectedMember?.name}</strong>?
        </p>
        <p className="modal-hint">
          You will be notified when a copy becomes available.
        </p>
        {reserveError && (
          <p className="error-text" role="alert">{reserveError}</p>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setShowReserveModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleReserve} isLoading={reserving}>
            Confirm Reservation
          </Button>
        </div>
      </Modal>
    </div>
  );
}
