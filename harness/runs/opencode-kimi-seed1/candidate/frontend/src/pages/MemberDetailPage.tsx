import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useFetch } from '../hooks/useApi';
import type { MemberWithStats, LoanWithBook, ReservationWithBook, Fine } from '../types';
import { Loading, ErrorMessage, EmptyState } from '../components/Status';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function ActiveLoans({ loans, onReturn }: { loans: LoanWithBook[]; onReturn: (loanId: string) => void }) {
  const [returningId, setReturningId] = useState<string | null>(null);

  if (loans.length === 0) {
    return <p className="empty-hint">No active loans</p>;
  }

  return (
    <ul className="loans-list">
      {loans.map(loan => {
        const isOverdue = loan.days_overdue > 0;
        return (
          <li key={loan.id} className={`loan-item ${isOverdue ? 'overdue' : ''}`}>
            <div className="loan-info">
              <strong>{loan.book_title}</strong>
              <span>Due: {formatDate(loan.due_at)}</span>
              {isOverdue && (
                <span className="overdue-badge">{loan.days_overdue} days overdue</span>
              )}
            </div>
            <Button
              onClick={() => {
                setReturningId(loan.id);
                onReturn(loan.id);
              }}
              isLoading={returningId === loan.id}
              variant="secondary"
            >
              Return
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function Reservations({ reservations }: { reservations: ReservationWithBook[] }) {
  if (reservations.length === 0) {
    return <p className="empty-hint">No active reservations</p>;
  }

  return (
    <ul className="reservations-list">
      {reservations.map(res => (
        <li key={res.id} className="reservation-item">
          <strong>{res.book_title}</strong>
          <span>Position: #{res.queue_position}</span>
          {res.status === 'notified' && res.expires_at && (
            <span className="notification-badge">
              Notification expires: {formatDate(res.expires_at)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Fines({
  fines,
  onPay
}: {
  fines: Fine[];
  onPay: (fineId: string) => void;
}) {
  const [payingId, setPayingId] = useState<string | null>(null);
  const [confirmPayId, setConfirmPayId] = useState<string | null>(null);

  if (fines.length === 0) {
    return <p className="empty-hint">No unpaid fines</p>;
  }

  const fineToPay = fines.find(f => f.id === confirmPayId);

  return (
    <>
      <ul className="fines-list">
        {fines.map(fine => (
          <li key={fine.id} className="fine-item">
            <div className="fine-info">
              <strong>{fine.book_title}</strong>
              <span className="fine-amount">{formatCurrency(fine.amount_cents)}</span>
            </div>
            <Button
              onClick={() => setConfirmPayId(fine.id)}
              variant="secondary"
            >
              Pay
            </Button>
          </li>
        ))}
      </ul>

      <Modal
        isOpen={!!confirmPayId}
        onClose={() => setConfirmPayId(null)}
        title="Confirm Payment"
      >
        {fineToPay && (
          <>
            <p>
              Pay <strong>{formatCurrency(fineToPay.amount_cents)}</strong> for{' '}
              <strong>{fineToPay.book_title}</strong>?
            </p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setConfirmPayId(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setPayingId(confirmPayId);
                  onPay(confirmPayId!);
                  setConfirmPayId(null);
                }}
                isLoading={payingId === confirmPayId}
              >
                Confirm Payment
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();

  const {
    data: member,
    loading: memberLoading,
    error: memberError,
    refetch: refetchMember
  } = useFetch<MemberWithStats>(id ? `/api/members/${id}` : null);

  const {
    data: loans,
    loading: loansLoading,
    refetch: refetchLoans
  } = useFetch<LoanWithBook[]>(id ? `/api/members/${id}/loans` : null);

  const {
    data: reservations,
    loading: reservationsLoading
  } = useFetch<ReservationWithBook[]>(id ? `/api/members/${id}/reservations` : null);

  const {
    data: fines,
    loading: finesLoading,
    refetch: refetchFines
  } = useFetch<Fine[]>(id ? `/api/members/${id}/fines` : null);

  async function handleReturn(loanId: string) {
    await fetch(`/api/loans/${loanId}/return`, { method: 'POST' });
    refetchLoans();
    refetchMember();
  }

  async function handlePay(fineId: string) {
    await fetch(`/api/fines/${fineId}/pay`, { method: 'POST' });
    refetchFines();
    refetchMember();
  }

  if (memberLoading) return <Loading />;
  if (memberError) return <ErrorMessage message={memberError} onRetry={refetchMember} />;
  if (!member) return <EmptyState message="Member not found" />;

  return (
    <div className="page">
      <Link to="/members" className="back-link">← Back to members</Link>

      <div className="member-header">
        <h1>{member.name}</h1>
        <span className={`status-badge ${member.status}`}>{member.status}</span>
      </div>

      <div className="member-details">
        <p><strong>Email:</strong> {member.email}</p>
        <p><strong>Member since:</strong> {formatDate(member.member_since)}</p>
      </div>

      <div className="stats-bar">
        <div className="stat-box">
          <span className="stat-value">{member.active_loans}</span>
          <span className="stat-label">Active Loans</span>
        </div>
        <div className="stat-box">
          <span className="stat-value">{formatCurrency(member.unpaid_fines_cents)}</span>
          <span className="stat-label">Unpaid Fines</span>
        </div>
      </div>

      <section className="member-section">
        <h2>Active Loans</h2>
        {loansLoading ? <Loading /> : (
          <ActiveLoans loans={loans || []} onReturn={handleReturn} />
        )}
      </section>

      <section className="member-section">
        <h2>Reservations</h2>
        {reservationsLoading ? <Loading /> : (
          <Reservations reservations={reservations || []} />
        )}
      </section>

      <section className="member-section">
        <h2>Unpaid Fines</h2>
        {finesLoading ? <Loading /> : (
          <Fines fines={fines || []} onPay={handlePay} />
        )}
      </section>
    </div>
  );
}
