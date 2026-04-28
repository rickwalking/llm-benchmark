import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, HttpError } from '../api/client';
import type { Book, Member, MemberDetail } from '../api/types';
import ErrorBanner from '../components/ErrorBanner';
import Spinner from '../components/Spinner';
import { formatDate } from '../utils/format';

type Step = 1 | 2 | 3;

export default function CheckoutPage() {
  const [step, setStep] = useState<Step>(1);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [books, setBooks] = useState<Book[] | null>(null);
  const [memberId, setMemberId] = useState<string>('');
  const [memberDetail, setMemberDetail] = useState<MemberDetail | null>(null);
  const [bookId, setBookId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ due_at: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.listMembers(), api.listBooks()])
      .then(([m, b]) => {
        setMembers(m);
        setBooks(b);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!memberId) {
      setMemberDetail(null);
      return;
    }
    api.getMember(memberId).then(setMemberDetail).catch(() => setMemberDetail(null));
  }, [memberId]);

  function next() {
    setError(null);
    if (step === 1 && !memberId) {
      setError('Pick a member to continue.');
      return;
    }
    if (step === 2 && !bookId) {
      setError('Pick a book to continue.');
      return;
    }
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  }

  function back() {
    setError(null);
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  async function confirm() {
    setError(null);
    setSubmitting(true);
    try {
      const loan = await api.borrow({ member_id: memberId, book_id: bookId });
      setCreatedInfo({ due_at: loan.due_at });
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (!members || !books) return <Spinner label="Preparing checkout…" />;

  const selectedBook = books.find((b) => b.id === bookId);
  const selectedMember = members.find((m) => m.id === memberId);
  const willBeFifth =
    memberDetail && memberDetail.active_loans.length === 4
      ? 'This will be the member’s 5th and final loan.'
      : null;

  if (createdInfo) {
    return (
      <section aria-labelledby="done-heading">
        <h1 id="done-heading">Checkout complete</h1>
        <p className="card">
          <strong>{selectedBook?.title}</strong> is now on loan to{' '}
          <strong>{selectedMember?.name}</strong>.<br />
          Due back by <strong>{formatDate(createdInfo.due_at)}</strong>.
        </p>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              setCreatedInfo(null);
              setStep(1);
              setMemberId('');
              setBookId('');
            }}
          >
            Start another checkout
          </button>
          <button
            className="btn btn--secondary"
            onClick={() => navigate(`/members/${memberId}`)}
          >
            View member profile
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="checkout-heading">
      <h1 id="checkout-heading">Checkout</h1>
      <ol className="steps" aria-label="Checkout progress">
        {[1, 2, 3].map((s) => (
          <li
            key={s}
            className={`steps__item ${
              step === s ? 'steps__item--active' : step > s ? 'steps__item--done' : ''
            }`}
            aria-current={step === s ? 'step' : undefined}
          >
            Step {s}: {s === 1 ? 'Member' : s === 2 ? 'Book' : 'Confirm'}
          </li>
        ))}
      </ol>

      {error ? <ErrorBanner message={error} /> : null}

      {step === 1 ? (
        <div>
          <h2>Pick a member</h2>
          {members.length === 0 ? (
            <p>No members exist yet — add one from the Members page.</p>
          ) : (
            <ul className="member-list" aria-label="Members">
              {members.map((m) => (
                <li
                  key={m.id}
                  className={`member-row ${memberId === m.id ? 'member-row--selected' : ''}`}
                  onClick={() => setMemberId(m.id)}
                >
                  <label style={{ display: 'flex', gap: 8, width: '100%', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="member"
                      value={m.id}
                      checked={memberId === m.id}
                      onChange={() => setMemberId(m.id)}
                    />
                    <span>
                      <strong>{m.name}</strong> &middot; <span className="muted">{m.email}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {step === 2 ? (
        <div>
          <h2>Pick a book</h2>
          <ul className="book-list" aria-label="Books">
            {books.map((b) => (
              <li
                key={b.id}
                className={`book-row ${bookId === b.id ? 'book-row--selected' : ''}`}
                onClick={() => setBookId(b.id)}
              >
                <label style={{ display: 'flex', gap: 8, width: '100%', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="book"
                    value={b.id}
                    checked={bookId === b.id}
                    onChange={() => setBookId(b.id)}
                  />
                  <span style={{ flex: 1 }}>
                    <strong>{b.title}</strong> &middot;{' '}
                    <span className="muted">by {b.author}</span>
                  </span>
                  <span>
                    {b.available_copies > 0 ? (
                      <span className="badge badge--available">
                        {b.available_copies} available
                      </span>
                    ) : (
                      <span className="badge badge--unavailable">All on loan</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step === 3 ? (
        <div>
          <h2>Confirm</h2>
          <div className="card">
            <p>
              Lend <strong>{selectedBook?.title}</strong> to{' '}
              <strong>{selectedMember?.name}</strong>?
            </p>
            <p>
              Due date: <strong>{formatDate(new Date(Date.now() + 14 * 86400_000).toISOString())}</strong>
            </p>
            {willBeFifth ? (
              <p className="warning-banner" role="status">{willBeFifth}</p>
            ) : null}
            {memberDetail && memberDetail.unpaid_fines_cents > 500 ? (
              <p className="warning-banner" role="status">
                Member has outstanding fines exceeding $5.00 — checkout will be rejected.
              </p>
            ) : null}
            {memberDetail && memberDetail.status === 'suspended' ? (
              <p className="warning-banner" role="status">
                Member is suspended — checkout will be rejected.
              </p>
            ) : null}
            {selectedBook && selectedBook.available_copies === 0 ? (
              <p className="warning-banner" role="status">
                No copies available — checkout may be rejected unless this member is the
                next-in-queue.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn btn--secondary" onClick={back} disabled={step === 1}>
          Back
        </button>
        <div className="spacer" />
        {step < 3 ? (
          <button className="btn" onClick={next} type="button">
            Next
          </button>
        ) : (
          <button className="btn" onClick={confirm} type="button" disabled={submitting}>
            {submitting ? 'Processing…' : 'Confirm checkout'}
          </button>
        )}
      </div>
    </section>
  );
}
