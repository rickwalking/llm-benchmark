import { CreditCard, RotateCcw } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import Message from "../components/Message";
import Modal from "../components/Modal";
import type { Fine, Loan, MemberDetail } from "../types";
import { formatCountdown, formatDate, formatMoney } from "../utils";

type PendingAction =
  | { type: "return"; loan: Loan }
  | { type: "pay"; fine: Fine }
  | null;

export default function MemberProfilePage(): ReactElement {
  const { id } = useParams();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);

  async function load(): Promise<void> {
    if (!id) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      setMember(await api.member(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load member");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (member?.reservations.some((reservation) => reservation.status === "notified")) {
        setMember({ ...member });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [member]);

  async function confirm(): Promise<void> {
    if (!pending) {
      return;
    }
    setError("");
    setNotice("");
    try {
      if (pending.type === "return") {
        await api.returnLoan(pending.loan.id);
        setNotice("Loan returned.");
      } else {
        await api.payFine(pending.fine.id);
        setNotice("Fine paid.");
      }
      setPending(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    }
  }

  return (
    <section>
      <Link className="back-link" to="/members">Back to members</Link>
      {loading ? <p className="empty-state">Loading profile…</p> : null}
      {error ? <Message kind="error">{error}</Message> : null}
      {notice ? <Message kind="success">{notice}</Message> : null}
      {member ? (
        <>
          <div className="detail-header">
            <div>
              <p className="eyebrow">Member profile</p>
              <h2>{member.name}</h2>
              <p>{member.email} · {member.status}</p>
            </div>
            <span className={member.unpaid_fines_cents > 0 ? "pill danger" : "pill"}>
              {formatMoney(member.unpaid_fines_cents)} unpaid
            </span>
          </div>
          <div className="three-column">
            <section className="data-panel" aria-labelledby="active-loans-heading">
              <h3 id="active-loans-heading">Active Loans</h3>
              {member.active_loans.length === 0 ? <p className="empty-state">No active loans.</p> : null}
              {member.active_loans.map((loan) => {
                const overdue = new Date(loan.due_at).getTime() < Date.now();
                return (
                  <div className="stack-row" key={loan.id}>
                    <span>
                      <strong>{loan.book_title}</strong>
                      <small>Due {formatDate(loan.due_at)} {overdue ? "· overdue" : ""}</small>
                    </span>
                    <button className="secondary" onClick={() => setPending({ type: "return", loan })} type="button">
                      <RotateCcw aria-hidden="true" size={16} /> Return
                    </button>
                  </div>
                );
              })}
            </section>
            <section className="data-panel" aria-labelledby="reservations-heading">
              <h3 id="reservations-heading">Reservations</h3>
              {member.reservations.length === 0 ? <p className="empty-state">No active reservations.</p> : null}
              {member.reservations.map((reservation) => (
                <div className="stack-row" key={reservation.id}>
                  <span>
                    <strong>{reservation.book_title}</strong>
                    <small>
                      {reservation.status === "notified"
                        ? `Notification expires in ${formatCountdown(reservation.expires_at)}`
                        : `Queue position ${reservation.queue_position}`}
                    </small>
                  </span>
                  <span className="pill">{reservation.status}</span>
                </div>
              ))}
            </section>
            <section className="data-panel" aria-labelledby="fines-heading">
              <h3 id="fines-heading">Unpaid Fines</h3>
              {member.unpaid_fines.length === 0 ? <p className="empty-state">No unpaid fines.</p> : null}
              {member.unpaid_fines.map((fine) => (
                <div className="stack-row" key={fine.id}>
                  <span>
                    <strong>{formatMoney(fine.amount_cents)}</strong>
                    <small>{fine.book_title}</small>
                  </span>
                  <button className="secondary" onClick={() => setPending({ type: "pay", fine })} type="button">
                    <CreditCard aria-hidden="true" size={16} /> Pay
                  </button>
                </div>
              ))}
            </section>
          </div>
        </>
      ) : null}
      {pending ? (
        <Modal title={pending.type === "return" ? "Confirm return" : "Confirm fine payment"} onClose={() => setPending(null)}>
          <p>
            {pending.type === "return"
              ? `Return ${pending.loan.book_title ?? "this book"} for ${member?.name}?`
              : `Mark ${formatMoney(pending.fine.amount_cents)} as paid?`}
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setPending(null)} type="button">Cancel</button>
            <button onClick={() => void confirm()} type="button">Confirm</button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
