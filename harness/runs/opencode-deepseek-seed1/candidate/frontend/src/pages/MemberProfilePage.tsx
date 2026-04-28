import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError, type MemberDetail, type MemberFine } from '../api';
import Modal from '../components/Modal';

export default function MemberProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [payFineTarget, setPayFineTarget] = useState<MemberFine | null>(null);

  const loadMember = () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api.members.get(id)
      .then(setMember)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load member'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadMember(); }, [id]);

  const handleReturn = async (loanId: string) => {
    setActionError(null);
    try {
      await api.loans.return(loanId);
      loadMember();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Failed to return');
    }
  };

  const handlePayFine = async () => {
    if (!payFineTarget) return;
    setActionError(null);
    try {
      await api.fines.pay(payFineTarget.id);
      setPayFineTarget(null);
      loadMember();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Failed to pay fine');
    }
  };

  if (loading) {
    return <div className="loading"><span className="spinner" /> Loading member...</div>;
  }

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  if (!member) {
    return <div className="alert alert-error">Member not found</div>;
  }

  const now = Date.now();

  return (
    <div>
      <Link to="/members" style={{ fontSize: '14px' }}>&larr; Back to members</Link>

      <div className="member-profile-header" style={{ marginTop: '12px' }}>
        <div>
          <h1>{member.name}</h1>
          <div style={{ marginTop: '8px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span className={`badge ${member.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
              {member.status}
            </span>
            <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
              {member.email}
            </span>
            <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
              Member since {member.member_since}
            </span>
          </div>
        </div>
        {member.unpaid_fines_cents > 0 && (
          <div className="alert alert-warning">
            Unpaid fines: ${(member.unpaid_fines_cents / 100).toFixed(2)}
          </div>
        )}
      </div>

      {actionError && <div className="alert alert-error">{actionError}</div>}

      <div className="card">
        <div className="card-header">Active Loans ({member.active_loans.length})</div>
        {member.active_loans.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px' }}>
            <p>No active loans.</p>
          </div>
        ) : (
          <table className="table" aria-label="Active loans">
            <thead>
              <tr>
                <th>Book</th>
                <th>Borrowed</th>
                <th>Due</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {member.active_loans.map(loan => {
                const dueDate = new Date(loan.due_at);
                const isOverdue = dueDate.getTime() < now;
                return (
                  <tr key={loan.id}>
                    <td>
                      {loan.book_title}
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{loan.book_author}</div>
                    </td>
                    <td>{new Date(loan.borrowed_at).toLocaleDateString()}</td>
                    <td>{dueDate.toLocaleDateString()}</td>
                    <td>
                      {isOverdue
                        ? <span className="badge badge-danger">Overdue</span>
                        : <span className="badge badge-success">On time</span>
                      }
                    </td>
                    <td>
                      <button className="btn-primary" onClick={() => handleReturn(loan.id)} style={{ fontSize: '12px', padding: '4px 12px' }}>
                        Return
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-header">Reservations ({member.reservations.length})</div>
        {member.reservations.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px' }}>
            <p>No active reservations.</p>
          </div>
        ) : (
          <table className="table" aria-label="Reservations">
            <thead>
              <tr>
                <th>Book</th>
                <th>Queued</th>
                <th>Status</th>
                <th>Countdown</th>
              </tr>
            </thead>
            <tbody>
              {member.reservations.map(res => {
                const expiresIn = res.expires_at ? new Date(res.expires_at).getTime() - now : null;
                return (
                  <tr key={res.id}>
                    <td>
                      <Link to={`/books/${res.book_id}`}>{res.book_title}</Link>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{res.book_author}</div>
                    </td>
                    <td>{new Date(res.queued_at).toLocaleDateString()}</td>
                    <td>
                      {res.status === 'notified'
                        ? <span className="badge badge-warning">Notified</span>
                        : <span className="badge badge-info">Waiting</span>
                      }
                    </td>
                    <td>
                      {res.status === 'notified' && expiresIn !== null && expiresIn > 0 ? (
                        <span className="queue-countdown">{formatDuration(expiresIn)}</span>
                      ) : res.status === 'notified' ? (
                        <span className="badge badge-danger">Expired</span>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-header">Fines ({member.fines.length})</div>
        {member.fines.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px' }}>
            <p>No fines on record.</p>
          </div>
        ) : (
          <table className="table" aria-label="Fines">
            <thead>
              <tr>
                <th>Book</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {member.fines.map(fine => (
                <tr key={fine.id}>
                  <td>{fine.book_title}</td>
                  <td>${(fine.amount_cents / 100).toFixed(2)}</td>
                  <td>
                    {fine.paid_at
                      ? <span className="badge badge-success">Paid</span>
                      : <span className="badge badge-danger">Unpaid</span>
                    }
                  </td>
                  <td>
                    {!fine.paid_at && (
                      <button className="btn-primary" onClick={() => setPayFineTarget(fine)} style={{ fontSize: '12px', padding: '4px 12px' }}>
                        Pay
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={payFineTarget !== null}
        onClose={() => setPayFineTarget(null)}
        title="Confirm Payment"
        actions={
          <>
            <button className="btn-secondary" onClick={() => setPayFineTarget(null)}>Cancel</button>
            <button className="btn-primary" onClick={handlePayFine}>Pay ${payFineTarget ? (payFineTarget.amount_cents / 100).toFixed(2) : '0.00'}</button>
          </>
        }
      >
        <p>Pay the fine of ${payFineTarget ? (payFineTarget.amount_cents / 100).toFixed(2) : '0.00'} for {payFineTarget?.book_title}?</p>
      </Modal>
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
