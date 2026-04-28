import { BookmarkPlus, RefreshCw } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import Message from "../components/Message";
import type { Book, Member } from "../types";
import { availabilityText, formatCountdown } from "../utils";

export default function BookDetailPage(): ReactElement {
  const { id } = useParams();
  const [book, setBook] = useState<Book | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedReservation = book?.selected_member_reservation ?? null;

  async function load(nextMemberId = memberId): Promise<void> {
    if (!id) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextBook, nextMembers] = await Promise.all([api.book(id, nextMemberId || undefined), api.members()]);
      setBook(nextBook);
      setMembers(nextMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load book");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("");
  }, [id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (book?.selected_member_reservation?.status === "notified") {
        setBook({ ...book });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [book]);

  async function reserve(): Promise<void> {
    if (!book || !memberId) {
      setError("Select a member before reserving.");
      return;
    }
    setNotice("");
    setError("");
    try {
      await api.reserve({ member_id: memberId, book_id: book.id });
      setNotice("Reservation added to the queue.");
      await load(memberId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reserve book");
    }
  }

  return (
    <section>
      <Link className="back-link" to="/books">Back to books</Link>
      {loading ? <p className="empty-state">Loading book…</p> : null}
      {error ? <Message kind="error">{error}</Message> : null}
      {notice ? <Message kind="success">{notice}</Message> : null}
      {book ? (
        <>
          <div className="detail-header">
            <div>
              <p className="eyebrow">Book detail</p>
              <h2>{book.title}</h2>
              <p>{book.author} · ISBN {book.isbn}</p>
            </div>
            <span className={book.available_copies === 0 ? "pill danger" : "pill"}>
              {availabilityText(book.available_copies, book.total_copies, book.reservation_queue_depth)}
            </span>
          </div>
          <div className="two-column">
            <div className="data-panel">
              <h3>Queue</h3>
              <p>{book.reservation_queue_depth} waiting or notified.</p>
              {selectedReservation?.status === "notified" ? (
                <Message kind="info">
                  This member has a notification, expires in {formatCountdown(selectedReservation.expires_at)}.
                </Message>
              ) : selectedReservation ? (
                <Message kind="info">Queue position {selectedReservation.queue_position}.</Message>
              ) : (
                <p className="muted">The selected member has no active reservation for this book.</p>
              )}
            </div>
            <div className="data-panel">
              <h3>Acting member</h3>
              <label>
                Member
                <select
                  value={memberId}
                  onChange={(event) => {
                    setMemberId(event.target.value);
                    void load(event.target.value);
                  }}
                >
                  <option value="">Select a member</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => void reserve()} type="button">
                <BookmarkPlus aria-hidden="true" size={16} /> Reserve
              </button>
              <button className="secondary" onClick={() => void load(memberId)} type="button">
                <RefreshCw aria-hidden="true" size={16} /> Refresh detail
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
