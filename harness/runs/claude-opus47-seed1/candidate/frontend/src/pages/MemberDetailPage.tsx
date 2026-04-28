import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, HttpError } from '../api/client';
import type { Fine, Loan, MemberDetail } from '../api/types';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import { countdownTo, formatCents, formatDate, isOverdue } from '../utils/format';

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returnTarget, setReturnTarget] = useState<Loan | null>(null);
  const [payTarget, setPayTarget] = useState<Fine | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    api
      .getMember(id)
      .then(setMember)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!member) return <Spinner label="Loading member…" />;

  return (
    <article aria-labelledby="member-heading">
      <p>
        <Link to="/members">&larr; Back to members</Link>
      </p>
      <h1 id="member-heading">{member.name}</h1>
      <p className="muted">{member.email}</p>
      <p>
        Status:{' '}
        {member.status === 'suspended' ? (
          <span className="badge badge--unavailable">Suspended</span>
        ) : (
          <span className="badge badge--available">Active</span>
        )}
      </p>

      <section className="section" aria-labelledby="loans-heading">
        <h2 id="loans-heading">Active loans ({member.active_loans.length})</h2>
        {member.active_loans.length === 0 ? (
          <EmptyState title="No active loans" description="This member has nothing checked out." />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {member.active_loans.map((loan) => {
              const overdue = isOverdue(loan.due_at, now);
              return (
                <li key={loan.id} className="card">
                  <div className="row">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{loan.book_title}</div>
                      <div className="muted">by {loan.book_author}</div>
                      <div>
                        Due {formatDate(loan.due_at)}{' '}
                        {overdue ? (
                          <span className="badge badge--overdue">Overdue</span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => setReturnTarget(loan)}
                    >
                      Return
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="reservations-heading">
        <h2 id="reservations-heading">Reservations ({member.reservations.length})</h2>
        {member.reservations.length === 0 ? (
          <EmptyState title="No reservations" description="This member is not waiting on any books." />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {member.reservations.map((r) => (
              <li key={r.id} className="card">
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>
                      <Link to={`/books/${r.book_id}?member=${member.id}`}>{r.book_title}</Link>
                    </div>
                    {r.status === 'notified' && r.expires_at ? (
                      <div>
                        <span className="badge badge--warn">
                          Notified — expires in {countdownTo(r.expires_at, now)}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="badge">Position #{r.position ?? '?'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="fines-heading">
        <h2 id="fines-heading">
          Unpaid fines ({formatCents(member.unpaid_fines_cents)})
        </h2>
        {member.unpaid_fines.length === 0 ? (
          <EmptyState title="No outstanding fines" description="This member is up to date." />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {member.unpaid_fines.map((fine) => (
              <li key={fine.id} className="card">
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{formatCents(fine.amount_cents)}</div>
                    <div className="muted">For: {fine.book_title}</div>
                  </div>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setPayTarget(fine)}
                  >
                    Pay
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmReturnModal
        loan={returnTarget}
        onClose={() => setReturnTarget(null)}
        onConfirmed={() => {
          setReturnTarget(null);
          load();
        }}
      />
      <ConfirmPayModal
        fine={payTarget}
        onClose={() => setPayTarget(null)}
        onConfirmed={() => {
          setPayTarget(null);
          load();
        }}
      />
    </article>
  );
}

function ConfirmReturnModal({
  loan,
  onClose,
  onConfirmed,
}: {
  loan: Loan | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loan) {
      setError(null);
      setBusy(false);
    }
  }, [loan]);

  async function confirm() {
    if (!loan) return;
    setBusy(true);
    setError(null);
    try {
      await api.returnLoan(loan.id);
      onConfirmed();
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'Return failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!loan} title="Confirm return" onClose={onClose}>
      {error ? <ErrorBanner message={error} /> : null}
      <p>
        Return <strong>{loan?.book_title}</strong> from this member?
      </p>
      <p className="muted">If overdue, a fine will be created automatically.</p>
      <div className="modal__actions">
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={busy} onClick={confirm}>
          {busy ? 'Returning…' : 'Confirm return'}
        </button>
      </div>
    </Modal>
  );
}

function ConfirmPayModal({
  fine,
  onClose,
  onConfirmed,
}: {
  fine: Fine | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!fine) {
      setError(null);
      setBusy(false);
    }
  }, [fine]);

  async function confirm() {
    if (!fine) return;
    setBusy(true);
    setError(null);
    try {
      await api.payFine(fine.id);
      onConfirmed();
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'Payment failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!fine} title="Confirm payment" onClose={onClose}>
      {error ? <ErrorBanner message={error} /> : null}
      <p>
        Mark fine of <strong>{fine ? formatCents(fine.amount_cents) : ''}</strong> as paid?
      </p>
      <div className="modal__actions">
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={busy} onClick={confirm}>
          {busy ? 'Processing…' : 'Confirm payment'}
        </button>
      </div>
    </Modal>
  );
}
