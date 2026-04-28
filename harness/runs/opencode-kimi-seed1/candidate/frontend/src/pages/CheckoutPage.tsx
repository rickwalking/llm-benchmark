import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch, useMutation } from '../hooks/useApi';
import { useSelectedMember } from '../contexts/MemberContext';
import type { Member, Book, Loan } from '../types';
import { Loading, ErrorMessage, EmptyState } from '../components/Status';
import { Button } from '../components/Button';

const STEPS = ['Select Member', 'Select Book', 'Confirm'] as const;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const { selectedMember, setSelectedMember } = useSelectedMember();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const { data: members, loading: membersLoading, error: membersError } = useFetch<Member[]>('/api/members');
  const { data: books, loading: booksLoading, error: booksError } = useFetch<Book[]>('/api/books');

  const { mutate: checkout, loading: checkingOut } = useMutation<Loan, { member_id: string; book_id: string }>(
    '/api/loans',
    {
      onSuccess: (loan) => {
        navigate(`/members/${loan.member_id}`);
      },
      onError: (err) => setCheckoutError(err)
    }
  );

  async function handleCheckout() {
    if (!selectedMember || !selectedBook) return;
    setCheckoutError(null);
    await checkout({ member_id: selectedMember.id, book_id: selectedBook.id });
  }

  function canProceed(): boolean {
    switch (currentStep) {
      case 0:
        return !!selectedMember;
      case 1:
        return !!selectedBook;
      case 2:
        return true;
      default:
        return false;
    }
  }

  function StepIndicator() {
    return (
      <div className="step-indicator" role="tablist" aria-label="Checkout steps">
        {STEPS.map((step, index) => (
          <div
            key={step}
            className={`step ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
            role="tab"
            aria-selected={index === currentStep}
          >
            <span className="step-number">{index + 1}</span>
            <span className="step-label">{step}</span>
          </div>
        ))}
      </div>
    );
  }

  function Step1SelectMember() {
    if (membersLoading) return <Loading />;
    if (membersError) return <ErrorMessage message={membersError} />;
    if (!members || members.length === 0) {
      return <EmptyState message="No members available. Add members from the Members page." />;
    }

    return (
      <div className="step-content">
        <h2>Select a Member</h2>
        <div className="selectable-list">
          {members.map(member => (
            <button
              key={member.id}
              className={`selectable-item ${selectedMember?.id === member.id ? 'selected' : ''} ${member.status === 'suspended' ? 'disabled' : ''}`}
              onClick={() => member.status === 'active' && setSelectedMember(member)}
              disabled={member.status === 'suspended'}
            >
              <div className="item-info">
                <strong>{member.name}</strong>
                <span>{member.email}</span>
                {member.status === 'suspended' && (
                  <span className="suspended-badge">Suspended</span>
                )}
              </div>
              {selectedMember?.id === member.id && <span className="check">✓</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function Step2SelectBook() {
    if (booksLoading) return <Loading />;
    if (booksError) return <ErrorMessage message={booksError} />;
    if (!books || books.length === 0) {
      return <EmptyState message="No books available." />;
    }

    const availableBooks = books.filter(b => b.available_copies > 0);

    return (
      <div className="step-content">
        <h2>Select a Book</h2>
        {availableBooks.length === 0 ? (
          <EmptyState message="No books currently available. Check the catalog for reservation options." />
        ) : (
          <div className="selectable-list">
            {availableBooks.map(book => (
              <button
                key={book.id}
                className={`selectable-item ${selectedBook?.id === book.id ? 'selected' : ''}`}
                onClick={() => setSelectedBook(book)}
              >
                <div className="item-info">
                  <strong>{book.title}</strong>
                  <span>by {book.author}</span>
                  <span className="availability">
                    {book.available_copies} of {book.total_copies} available
                  </span>
                </div>
                {selectedBook?.id === book.id && <span className="check">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function Step3Confirm() {
    if (!selectedMember || !selectedBook) return null;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);

    const warnings: string[] = [];
    if (selectedMember.status === 'suspended') {
      warnings.push('⚠️ Member is suspended');
    }

    return (
      <div className="step-content">
        <h2>Confirm Checkout</h2>
        <div className="confirmation-summary">
          <div className="summary-section">
            <h3>Member</h3>
            <p><strong>{selectedMember.name}</strong></p>
            <p>{selectedMember.email}</p>
          </div>
          <div className="summary-section">
            <h3>Book</h3>
            <p><strong>{selectedBook.title}</strong></p>
            <p>by {selectedBook.author}</p>
          </div>
          <div className="summary-section">
            <h3>Due Date</h3>
            <p className="due-date">{formatDate(dueDate.toISOString())}</p>
            <p className="loan-period">14 day loan period</p>
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="warnings" role="alert">
            {warnings.map((w, i) => <p key={i}>{w}</p>)}
          </div>
        )}

        {checkoutError && (
          <div className="error-banner" role="alert">
            {checkoutError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page checkout-page">
      <h1>Checkout</h1>
      <StepIndicator />

      <div className="step-container">
        {currentStep === 0 && <Step1SelectMember />}
        {currentStep === 1 && <Step2SelectBook />}
        {currentStep === 2 && <Step3Confirm />}
      </div>

      <div className="step-navigation">
        <Button
          variant="secondary"
          onClick={() => setCurrentStep(prev => prev - 1)}
          disabled={currentStep === 0}
        >
          Back
        </Button>

        {currentStep < STEPS.length - 1 ? (
          <Button
            onClick={() => setCurrentStep(prev => prev + 1)}
            disabled={!canProceed()}
          >
            Next
          </Button>
        ) : (
          <Button
            onClick={handleCheckout}
            disabled={!canProceed() || checkingOut}
            isLoading={checkingOut}
          >
            Complete Checkout
          </Button>
        )}
      </div>
    </div>
  );
}
