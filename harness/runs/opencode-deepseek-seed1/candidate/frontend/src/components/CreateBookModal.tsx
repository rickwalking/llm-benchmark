import { useState } from 'react';
import Modal from './Modal';
import { api, ApiError } from '../api';

export default function CreateBookModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [totalCopies, setTotalCopies] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await api.books.create({ title, author, isbn, total_copies: totalCopies });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create book');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add New Book"
      actions={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Book'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group">
        <label htmlFor="book-title">Title *</label>
        <input id="book-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="book-author">Author *</label>
        <input id="book-author" value={author} onChange={(e) => setAuthor(e.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="book-isbn">ISBN *</label>
        <input id="book-isbn" value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="10 or 13 digits, hyphens allowed" />
      </div>
      <div className="form-group">
        <label htmlFor="book-copies">Total Copies *</label>
        <input id="book-copies" type="number" min={1} value={totalCopies} onChange={(e) => setTotalCopies(Number(e.target.value))} />
      </div>
    </Modal>
  );
}
