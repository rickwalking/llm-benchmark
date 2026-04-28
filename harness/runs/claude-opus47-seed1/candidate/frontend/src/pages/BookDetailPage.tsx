import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, HttpError } from '../api/client';
import type { BookDetail, Member, MemberDetail, Reservation } from '../api/types';
import ErrorBanner from '../components/ErrorBanner';
import Spinner from '../components/Spinner';
import { countdownTo } from '../utils/format';

export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const memberId = searchParams.get('member') ?? '';
  const [memberDetail, setMemberDetail] = useState<MemberDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(() => {
    if (!id) return;
    setError(null);
    Promise.all([api.getBook(id), api.listMembers()])
      .then(([bookData, memberData]) => {
        setBook(bookData);
        setMembers(memberData);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!memberId) {
      setMemberDetail(null);
      return;
    }
    api
      .getMember(memberId)
      .then(setMemberDetail)
      .catch(() => setMemberDetail(null));
  }, [memberId, book]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function handleReserve() {
    setActionError(null);
    if (!id || !memberId) {
      setActionError('Pick a member first.');
      return;
    }
    try {
      await api.reserve({ book_id: id, member_id: memberId });
      refresh();
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Could not reserve';
      setActionError(msg);
    }
  }

  async function handleBorrow() {
    setActionError(null);
    if (!id || !memberId) {
      setActionError('Pick a member first.');
      return;
    }
    try {
      await api.borrow({ book_id: id, member_id: memberId });
      refresh();
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Could not borrow';
      setActionError(msg);
    }
  }

  if (error) return <ErrorBanner message={error} />;
  if (!book) return <Spinner label="Loading book…" />;

  const myReservation = memberDetail?.reservations.find((r) => r.book_id === book.id) ?? null;
  const myActiveLoan = memberDetail?.active_loans.find((l) => l.book_id === book.id) ?? null;

  return (
    <article aria-labelledby="book-heading">
      <p>
        <Link to="/books">&larr; Back to catalog</Link>
      </p>
      <h1 id="book-heading">{book.title}</h1>
      <p className="muted">by {book.author}</p>

      <section className="card section">
        <dl className="kv">
          <dt>ISBN</dt>
          <dd>{book.isbn}</dd>
          <dt>Total copies</dt>
          <dd>{book.total_copies}</dd>
          <dt>Available now</dt>
          <dd>
            {book.available_copies > 0 ? (
              <span className="badge badge--available">{book.available_copies}</span>
            ) : (
              <span className="badge badge--unavailable">0 — all on loan</span>
            )}
          </dd>
          <dt>Reservation queue</dt>
          <dd data-testid="queue-depth">
            {book.reservation_queue_depth} {book.reservation_queue_depth === 1 ? 'person' : 'people'}{' '}
            waiting
          </dd>
        </dl>
      </section>

      <section className="card section" aria-labelledby="member-actions">
        <h2 id="member-actions">Member actions</h2>
        <div className="form-field">
          <label htmlFor="member-pick">Acting as member</label>
          <select
            id="member-pick"
            value={memberId}
            onChange={(e) => {
              const value = e.target.value;
              if (value) {
                setSearchParams({ member: value });
              } else {
                setSearchParams({});
              }
            }}
          >
            <option value="">— select a member —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {memberDetail && myActiveLoan ? (
          <p>
            <span className="badge">You have this on loan</span>
          </p>
        ) : null}

        {memberDetail && myReservation ? (
          <MyReservationStatus reservation={myReservation} now={now} />
        ) : null}

        {actionError ? <ErrorBanner message={actionError} /> : null}

        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="btn"
            type="button"
            onClick={handleBorrow}
            disabled={!memberId}
          >
            Borrow
          </button>
          <button
            className="btn btn--secondary"
            type="button"
            onClick={handleReserve}
            disabled={!memberId || !!myReservation || !!myActiveLoan}
          >
            Reserve
          </button>
        </div>
      </section>
    </article>
  );
}

function MyReservationStatus({ reservation, now }: { reservation: Reservation; now: Date }) {
  if (reservation.status === 'notified' && reservation.expires_at) {
    return (
      <p data-testid="reservation-status">
        <span className="badge badge--warn">
          You have a notification, expires in {countdownTo(reservation.expires_at, now)}
        </span>
      </p>
    );
  }
  if (reservation.status === 'waiting') {
    return (
      <p data-testid="reservation-status">
        <span className="badge">
          You are #{reservation.position ?? '?'} in the queue
        </span>
      </p>
    );
  }
  return null;
}
