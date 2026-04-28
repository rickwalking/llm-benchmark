import { useState, useEffect } from 'react';
import { useApp } from '../context';
import { api, ApiError, type Book, type Member } from '../api';

type Step = 'member' | 'book' | 'confirm';

export default function CheckoutPage() {
  const { selectedMember, setSelectedMember } = useApp();
  const [step, setStep] = useState<Step>('member');

  const [members, setMembers] = useState<Member[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [memberId, setMemberId] = useState(selectedMember?.id ?? '');
  const [bookId, setBookId] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const selectedBook = books.find(b => b.id === bookId);
  const selectedM = members.find(m => m.id === memberId);

  useEffect(() => {
    api.members.list()
      .then(setMembers)
      .catch(() => {})
      .finally(() => setLoadingMembers(false));

    api.books.list()
      .then(setBooks)
      .catch(() => {})
      .finally(() => setLoadingBooks(false));
  }, []);

  useEffect(() => {
    if (selectedMember) {
      setMemberId(selectedMember.id);
    }
  }, [selectedMember]);

  const handleMemberSelect = (id: string) => {
    setMemberId(id);
    const member = members.find(m => m.id === id);
    if (member) {
      setSelectedMember(member);
    }
  };

  const goToStep = (s: Step) => {
    setError(null);
    setStep(s);
  };

  const handleNext = () => {
    if (step === 'member' && !memberId) {
      setError('Please select a member');
      return;
    }
    if (step === 'book') {
      if (!bookId) {
        setError('Please select a book');
        return;
      }
      if (!selectedBook || selectedBook.available_copies <= 0) {
        setError('Selected book has no available copies');
        return;
      }
    }
    if (step === 'member') goToStep('book');
    else if (step === 'book') goToStep('confirm');
  };

  const handleConfirm = async () => {
    if (!memberId || !bookId) return;
    setError(null);
    try {
      await api.loans.borrow(memberId, bookId);
      setSuccess(true);
      api.books.list().then(setBooks).catch(() => {});
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Checkout failed');
    }
  };

  const handleReset = () => {
    setStep('member');
    setMemberId('');
    setBookId('');
    setError(null);
    setSuccess(false);
  };

  if (success) {
    const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    return (
      <div>
        <h1 style={{ fontSize: '22px', marginBottom: '16px' }}>Checkout</h1>
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#10003;</div>
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Checkout Successful</h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '4px' }}>
            {selectedBook?.title} lent to {selectedM?.name}
          </p>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '20px' }}>
            Due: {dueDate.toLocaleDateString()}
          </p>
          <button className="btn-primary" onClick={handleReset}>New Checkout</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '22px', marginBottom: '20px' }}>Checkout</h1>

      <div className="steps" role="tablist" aria-label="Checkout steps">
        <div className={`step ${step === 'member' ? 'active' : ''} ${(step === 'book' || step === 'confirm') ? 'completed' : ''}`} role="tab" aria-selected={step === 'member'}>
          1. Select Member
        </div>
        <div className={`step ${step === 'book' ? 'active' : ''} ${step === 'confirm' ? 'completed' : ''}`} role="tab" aria-selected={step === 'book'}>
          2. Select Book
        </div>
        <div className={`step ${step === 'confirm' ? 'active' : ''}`} role="tab" aria-selected={step === 'confirm'}>
          3. Confirm
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {step === 'member' && (
        <div className="card">
          <div className="card-header">Select Member</div>
          {loadingMembers ? (
            <div className="loading"><span className="spinner" /></div>
          ) : (
            <div className="form-group">
              <label htmlFor="checkout-member">Member</label>
              <select
                id="checkout-member"
                value={memberId}
                onChange={(e) => handleMemberSelect(e.target.value)}
              >
                <option value="">-- Select member --</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email}) {m.status === 'suspended' ? '— SUSPENDED' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {step === 'book' && (
        <div className="card">
          <div className="card-header">Select Book</div>
          {loadingBooks ? (
            <div className="loading"><span className="spinner" /></div>
          ) : (
            <div className="form-group">
              <label htmlFor="checkout-book">Book</label>
              <select
                id="checkout-book"
                value={bookId}
                onChange={(e) => setBookId(e.target.value)}
              >
                <option value="">-- Select book --</option>
                {books.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.title} by {b.author} ({b.available_copies} of {b.total_copies} available)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {step === 'confirm' && selectedBook && selectedM && (
        <div className="card">
          <div className="card-header">Confirm Checkout</div>

          <div className="detail-grid" style={{ marginBottom: '16px' }}>
            <div className="detail-item">
              <span>Member</span>
              <strong>{selectedM.name}</strong>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{selectedM.email}</div>
            </div>
            <div className="detail-item">
              <span>Book</span>
              <strong>{selectedBook.title}</strong>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>by {selectedBook.author}</div>
            </div>
            <div className="detail-item">
              <span>Due Date</span>
              <strong>{new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString()}</strong>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>14-day loan period</div>
            </div>
            <div className="detail-item">
              <span>Availability After</span>
              <strong>{selectedBook.available_copies - 1} of {selectedBook.total_copies}</strong>
            </div>
          </div>

          {selectedM.status === 'suspended' && (
            <div className="alert alert-warning">This member is suspended and cannot borrow.</div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
        <button
          className="btn-secondary"
          onClick={() => {
            if (step === 'book') goToStep('member');
            else if (step === 'confirm') goToStep('book');
          }}
          disabled={step === 'member'}
        >
          Back
        </button>

        {step !== 'confirm' ? (
          <button className="btn-primary" onClick={handleNext}>
            Next
          </button>
        ) : (
          <button className="btn-primary" onClick={handleConfirm}>
            Confirm Checkout
          </button>
        )}
      </div>
    </div>
  );
}
