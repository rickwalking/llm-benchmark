import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api, type Book, type Member } from '../api';

type Step = 1 | 2 | 3;

export function Checkout() {
  const [step, setStep] = useState<Step>(1);
  const [members, setMembers] = useState<Member[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedMember, setSelectedMember] = useState('');
  const [selectedBook, setSelectedBook] = useState('');
  const [error, setError] = useState('');
  const [loanResult, setLoanResult] = useState<{ due_at: string } | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [m, b] = await Promise.all([api.members.list(), api.books.list()]);
    setMembers(m);
    setBooks(b);
  }

  const prefillMember = searchParams.get('member_id') || selectedMember;
  const prefillBook = searchParams.get('book_id') || selectedBook;

  useEffect(() => {
    if (prefillMember && !selectedMember) setSelectedMember(prefillMember);
    if (prefillBook && !selectedBook) setSelectedBook(prefillBook);
  }, [prefillMember, prefillBook]);

  const member = members.find((m) => m.id === selectedMember);
  const book = books.find((b) => b.id === selectedBook);

  async function handleSubmit() {
    if (!selectedMember || !selectedBook) return;
    setError('');
    try {
      const loan = await api.loans.borrow(selectedMember, selectedBook);
      setLoanResult({ due_at: loan.due_at });
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create loan');
    }
  }

  function reset() {
    setStep(1);
    setSelectedMember('');
    setSelectedBook('');
    setError('');
    setLoanResult(null);
  }

  const activeLoanCount = member?.active_loans ?? 0;
  const maxLoans = activeLoanCount >= 5;
  const hasFines = (member?.unpaid_fines_cents ?? 0) > 500;
  const isSuspended = member?.status === 'suspended';

  return (
    <div>
      <h1>Checkout</h1>

      <div className="steps">
        <div className={`step${step >= 1 ? ' active' : ''}${step > 1 ? ' completed' : ''}`}>
          1. Select Member
        </div>
        <span className="step-arrow">&rarr;</span>
        <div className={`step${step >= 2 ? ' active' : ''}${step > 2 ? ' completed' : ''}`}>
          2. Select Book
        </div>
        <span className="step-arrow">&rarr;</span>
        <div className={`step${step >= 3 ? ' active' : ''}`}>
          3. Confirm
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {step === 1 && (
        <div className="card">
          <h2>Select Member</h2>
          <div className="form-group">
            <label htmlFor="checkout-member">Member</label>
            <select
              id="checkout-member"
              value={selectedMember}
              onChange={(e) => setSelectedMember(e.target.value)}
            >
              <option value="">Choose a member&hellip;</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.status}{m.unpaid_fines_cents > 0 ? `, $${(m.unpaid_fines_cents / 100).toFixed(2)} fines` : ''})
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary"
            disabled={!selectedMember}
            onClick={() => setStep(2)}
          >
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h2>Select Book</h2>
          <div className="form-group">
            <label htmlFor="checkout-book">Book</label>
            <select
              id="checkout-book"
              value={selectedBook}
              onChange={(e) => setSelectedBook(e.target.value)}
            >
              <option value="">Choose a book&hellip;</option>
              {books.map((b) => (
                <option key={b.id} value={b.id} disabled={b.available_copies <= 0}>
                  {b.title} ({b.available_copies} available)
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn" onClick={() => setStep(1)}>Back</button>
            <button
              className="btn btn-primary"
              disabled={!selectedBook}
              onClick={() => setStep(3)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && !loanResult && (
        <div className="card">
          <h2>Confirm Checkout</h2>
          <p><strong>Member:</strong> {member?.name}</p>
          <p><strong>Book:</strong> {book?.title}</p>

          {isSuspended && <div className="alert alert-danger">Member is suspended.</div>}
          {hasFines && (
            <div className="alert alert-danger">
              Outstanding fines exceed ${(500 / 100).toFixed(2)} limit.
            </div>
          )}
          {maxLoans && <div className="alert alert-warning">This is the member&apos;s 5th active loan.</div>}
          {activeLoanCount >= 6 && (
            <div className="alert alert-danger">Loan limit reached (5 active loans maximum).</div>
          )}

          {!isSuspended && !hasFines && activeLoanCount < 5 && book && book.available_copies > 0 && (
            <p style={{ marginTop: '0.5rem' }}>
              Due date: <strong>{new Date(Date.now() + 14 * 86400000).toLocaleDateString()}</strong>
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn" onClick={() => setStep(2)}>Back</button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={isSuspended || hasFines || activeLoanCount >= 5 || (book?.available_copies ?? 0) <= 0}
            >
              Confirm Checkout
            </button>
          </div>
        </div>
      )}

      {step === 3 && loanResult && (
        <div className="card">
          <h2>Checkout Successful!</h2>
          <p>The book has been checked out successfully.</p>
          <p>Due date: <strong>{new Date(loanResult.due_at).toLocaleDateString()}</strong></p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={reset}>New Checkout</button>
            <button className="btn" onClick={() => navigate('/books')}>View Catalog</button>
          </div>
        </div>
      )}
    </div>
  );
}