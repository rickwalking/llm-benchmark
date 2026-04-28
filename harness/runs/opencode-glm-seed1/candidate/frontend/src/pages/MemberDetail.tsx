import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router';
import { api, type MemberDetail as MemberDetailType, type Loan, type Fine, type Reservation } from '../api';
import { PayFineModal } from '../components/PayFineModal';
import { ConfirmReturnModal } from '../components/ConfirmReturnModal';

export function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<MemberDetailType | null>(null);
  const [books, setBooks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payingFine, setPayingFine] = useState<string | null>(null);
  const [returningLoan, setReturningLoan] = useState<string | null>(null);

  const loadMember = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await api.members.get(id);
      setMember(data);
      setError('');
      const bookIds = new Set<string>();
      if (data.active_loans) data.active_loans.forEach((l: Loan) => bookIds.add(l.book_id));
      if (data.reservations) data.reservations.forEach((r: Reservation) => bookIds.add(r.book_id));
      const bookMap: Record<string, string> = {};
      for (const bid of bookIds) {
        try {
          const b = await api.books.get(bid);
          bookMap[bid] = b.title;
        } catch {
          bookMap[bid] = bid;
        }
      }
      setBooks(bookMap);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load member');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadMember();
  }, [loadMember]);

  async function handleReturnLoan(loanId: string) {
    try {
      await api.loans.returnLoan(loanId);
      setReturningLoan(null);
      loadMember();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to return book');
    }
  }

  async function handlePayFine(fineId: string) {
    try {
      await api.fines.pay(fineId);
      setPayingFine(null);
      loadMember();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to pay fine');
    }
  }

  if (loading) return <p>Loading member details&hellip;</p>;
  if (error && !member) return <div className="alert alert-danger">{error}</div>;
  if (!member) return <div className="empty-state"><p>Member not found.</p></div>;

  const now = new Date();

  return (
    <div>
      <Link to="/members">&larr; Back to members</Link>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>{member.name}</h1>
          <span className={`badge ${member.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
            {member.status}
          </span>
        </div>
        <p style={{ color: 'var(--color-text-light)' }}>{member.email}</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
          Member since {member.member_since}
        </p>

        {member.unpaid_fines_cents > 0 && (
          <div className="alert alert-warning" style={{ marginTop: '0.75rem' }}>
            Unpaid fines: ${(member.unpaid_fines_cents / 100).toFixed(2)}
          </div>
        )}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <h2 style={{ marginTop: '1.5rem' }}>Active Loans</h2>
      {!member.active_loans || member.active_loans.length === 0 ? (
        <div className="empty-state"><p>No active loans.</p></div>
      ) : (
        <div className="card" style={{ marginTop: '0.5rem' }}>
          <table>
            <thead>
              <tr>
                <th>Book</th>
                <th>Borrowed</th>
                <th>Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {member.active_loans.map((loan: Loan) => {
                const dueDate = new Date(loan.due_at);
                const isOverdue = dueDate < now;
                return (
                  <tr key={loan.id}>
                    <td>{books[loan.book_id] || loan.book_id}</td>
                    <td>{new Date(loan.borrowed_at).toLocaleDateString()}</td>
                    <td>{dueDate.toLocaleDateString()}</td>
                    <td>
                      {isOverdue ? (
                        <span className="badge badge-danger">Overdue</span>
                      ) : (
                        <span className="badge badge-success">On time</span>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-sm" onClick={() => setReturningLoan(loan.id)}>Return</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ marginTop: '1.5rem' }}>Reservations</h2>
      {!member.reservations || member.reservations.length === 0 ? (
        <div className="empty-state"><p>No active reservations.</p></div>
      ) : (
        <div className="card" style={{ marginTop: '0.5rem' }}>
          <table>
            <thead>
              <tr>
                <th>Book</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {member.reservations.map((res: Reservation) => (
                <tr key={res.id}>
                  <td>{books[res.book_id] || res.book_id}</td>
                  <td>
                    <span className={`badge ${res.status === 'notified' ? 'badge-warning' : 'badge-info'}`}>
                      {res.status}
                    </span>
                  </td>
                  <td>
                    {res.status === 'notified' && res.expires_at && (
                      <span>Notification expires {new Date(res.expires_at).toLocaleString()}</span>
                    )}
                    {res.status === 'waiting' && (
                      <span>Queued since {new Date(res.queued_at).toLocaleDateString()}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ marginTop: '1.5rem' }}>Fines</h2>
      {!member.fines || member.fines.filter((f: Fine) => !f.paid_at).length === 0 ? (
        <div className="empty-state"><p>No unpaid fines.</p></div>
      ) : (
        <div className="card" style={{ marginTop: '0.5rem' }}>
          <table>
            <thead>
              <tr>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {member.fines.filter((f: Fine) => !f.paid_at).map((fine: Fine) => (
                <tr key={fine.id}>
                  <td>${(fine.amount_cents / 100).toFixed(2)}</td>
                  <td>
                    <button className="btn btn-sm btn-primary" onClick={() => setPayingFine(fine.id)}>Pay</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payingFine && (
        <PayFineModal
          fineId={payingFine}
          onConfirm={() => handlePayFine(payingFine)}
          onCancel={() => setPayingFine(null)}
        />
      )}

      {returningLoan && (
        <ConfirmReturnModal
          loanId={returningLoan}
          onConfirm={() => handleReturnLoan(returningLoan)}
          onCancel={() => setReturningLoan(null)}
        />
      )}
    </div>
  );
}