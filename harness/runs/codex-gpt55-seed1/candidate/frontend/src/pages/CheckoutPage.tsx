import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api";
import Message from "../components/Message";
import type { Book, Member, MemberDetail } from "../types";
import { availabilityText, dueDateFromToday, formatDate, formatMoney } from "../utils";

export default function CheckoutPage(): ReactElement {
  const [step, setStep] = useState(1);
  const [members, setMembers] = useState<Member[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [memberId, setMemberId] = useState("");
  const [bookId, setBookId] = useState("");
  const [profile, setProfile] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedMember = members.find((member) => member.id === memberId);
  const selectedBook = books.find((book) => book.id === bookId);
  const dueAt = useMemo(() => dueDateFromToday(), []);

  useEffect(() => {
    async function load(): Promise<void> {
      setLoading(true);
      try {
        const [nextMembers, nextBooks] = await Promise.all([api.members(), api.books()]);
        setMembers(nextMembers);
        setBooks(nextBooks);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load checkout data");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    if (!memberId) {
      setProfile(null);
      return;
    }
    api.member(memberId).then(setProfile).catch(() => setProfile(null));
  }, [memberId]);

  function next(): void {
    setError("");
    if (step === 1 && !memberId) {
      setError("Choose a member to continue.");
      return;
    }
    if (step === 2 && !bookId) {
      setError("Choose a book to continue.");
      return;
    }
    setStep(Math.min(3, step + 1));
  }

  async function confirm(): Promise<void> {
    if (!memberId || !bookId) {
      return;
    }
    setError("");
    setNotice("");
    try {
      await api.borrow({ member_id: memberId, book_id: bookId });
      setNotice("Checkout complete.");
      setStep(1);
      setBookId("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Checkout failed");
    }
  }

  return (
    <section>
      <div className="section-title">
        <div>
          <p className="eyebrow">Checkout</p>
          <h2>Lend a Book</h2>
        </div>
      </div>
      <ol className="steps" aria-label="Checkout steps">
        {[1, 2, 3].map((item) => (
          <li className={item === step ? "current" : ""} key={item}>Step {item}</li>
        ))}
      </ol>
      {loading ? <p className="empty-state">Loading checkout…</p> : null}
      {error ? <Message kind="error">{error}</Message> : null}
      {notice ? <Message kind="success">{notice}</Message> : null}
      {!loading && step === 1 ? (
        <div className="data-panel wide">
          <h3>Pick member</h3>
          <label>
            Member
            <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
              <option value="">Select a member</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {!loading && step === 2 ? (
        <div className="data-panel wide">
          <h3>Pick book</h3>
          {books.length === 0 ? <p className="empty-state">No books are available in the catalog.</p> : null}
          <div className="choice-grid">
            {books.map((book) => (
              <label className="choice" key={book.id}>
                <input
                  checked={bookId === book.id}
                  name="book"
                  onChange={() => setBookId(book.id)}
                  type="radio"
                />
                <span>
                  <strong>{book.title}</strong>
                  <small>{availabilityText(book.available_copies, book.total_copies, book.reservation_queue_depth)}</small>
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      {!loading && step === 3 ? (
        <div className="data-panel wide">
          <h3>Confirm loan</h3>
          <dl className="summary-list">
            <div><dt>Member</dt><dd>{selectedMember?.name}</dd></div>
            <div><dt>Book</dt><dd>{selectedBook?.title}</dd></div>
            <div><dt>Due date</dt><dd>{formatDate(dueAt)}</dd></div>
          </dl>
          {profile?.active_loans.length === 4 ? (
            <Message kind="info">This is the member&apos;s 5th active loan.</Message>
          ) : null}
          {profile && profile.unpaid_fines_cents > 0 ? (
            <Message kind="info">Unpaid fines: {formatMoney(profile.unpaid_fines_cents)}.</Message>
          ) : null}
        </div>
      ) : null}
      <div className="form-actions">
        <button className="secondary" disabled={step === 1} onClick={() => setStep(Math.max(1, step - 1))} type="button">
          <ArrowLeft aria-hidden="true" size={16} /> Back
        </button>
        {step < 3 ? (
          <button onClick={next} type="button">
            Next <ArrowRight aria-hidden="true" size={16} />
          </button>
        ) : (
          <button onClick={() => void confirm()} type="button">
            <CheckCircle2 aria-hidden="true" size={16} /> Confirm checkout
          </button>
        )}
      </div>
    </section>
  );
}
