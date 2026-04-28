import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, HttpError } from '../api/client';
import type { Book } from '../api/types';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';

export default function BooksPage() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  function load() {
    setError(null);
    api
      .listBooks()
      .then(setBooks)
      .catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section aria-labelledby="books-heading">
      <div className="toolbar">
        <h1 id="books-heading">Catalog</h1>
        <button className="btn" onClick={() => setShowAdd(true)} type="button">
          Add book
        </button>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {!books && !error ? <Spinner label="Loading catalog…" /> : null}

      {books && books.length === 0 ? (
        <EmptyState
          title="The catalog is empty"
          description="Add your first book to get started."
          action={
            <button className="btn" onClick={() => setShowAdd(true)} type="button">
              Add a book
            </button>
          }
        />
      ) : null}

      {books && books.length > 0 ? (
        <ul className="book-grid" aria-label="Book catalog">
          {books.map((book) => (
            <li key={book.id} style={{ listStyle: 'none' }}>
              <Link className="book-card" to={`/books/${book.id}`} data-testid="book-card">
                <span className="book-card__title">{book.title}</span>
                <span className="book-card__author">by {book.author}</span>
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  ISBN {book.isbn}
                </span>
                <Availability book={book} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <AddBookModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => {
          setShowAdd(false);
          load();
        }}
      />
    </section>
  );
}

function Availability({ book }: { book: Book }) {
  if (book.available_copies > 0) {
    return (
      <span className="book-card__availability">
        <span className="badge badge--available">
          {book.available_copies} of {book.total_copies} available
        </span>
      </span>
    );
  }
  return (
    <span className="book-card__availability">
      <span className="badge badge--unavailable">All copies on loan</span>
    </span>
  );
}

interface AddBookModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function AddBookModal({ open, onClose, onCreated }: AddBookModalProps) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [copies, setCopies] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setAuthor('');
      setIsbn('');
      setCopies('1');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.createBook({
        title,
        author,
        isbn,
        total_copies: Number(copies),
      });
      onCreated();
    } catch (err) {
      const message = err instanceof HttpError ? err.message : 'Could not create book';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} title="Add a book" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        {error ? <ErrorBanner message={error} /> : null}
        <div className="form-field">
          <label htmlFor="book-title">Title</label>
          <input
            id="book-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="book-author">Author</label>
          <input
            id="book-author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="book-isbn">ISBN</label>
          <input
            id="book-isbn"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            placeholder="978-3-16-148410-0"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="book-copies">Total copies</label>
          <input
            id="book-copies"
            type="number"
            min={1}
            value={copies}
            onChange={(e) => setCopies(e.target.value)}
            required
          />
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add book'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
