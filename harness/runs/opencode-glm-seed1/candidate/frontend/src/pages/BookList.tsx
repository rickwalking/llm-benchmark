import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, type Book } from '../api';

export function BookList() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    loadBooks();
  }, []);

  async function loadBooks() {
    try {
      setLoading(true);
      const data = await api.books.list();
      setBooks(data);
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load books');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = {
      title: (form.elements.namedItem('title') as HTMLInputElement).value,
      author: (form.elements.namedItem('author') as HTMLInputElement).value,
      isbn: (form.elements.namedItem('isbn') as HTMLInputElement).value,
      total_copies: parseInt((form.elements.namedItem('total_copies') as HTMLInputElement).value, 10),
    };
    try {
      await api.books.create(data);
      setShowForm(false);
      form.reset();
      loadBooks();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create book');
    }
  }

  const highlightId = searchParams.get('highlight');

  if (loading) return <p>Loading books&hellip;</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Book Catalog</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add Book'}
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: '1.5rem' }}>
          <h2>New Book</h2>
          <div className="form-group">
            <label htmlFor="book-title">Title</label>
            <input id="book-title" name="title" required />
          </div>
          <div className="form-group">
            <label htmlFor="book-author">Author</label>
            <input id="book-author" name="author" required />
          </div>
          <div className="form-group">
            <label htmlFor="book-isbn">ISBN</label>
            <input id="book-isbn" name="isbn" required />
          </div>
          <div className="form-group">
            <label htmlFor="book-copies">Total Copies</label>
            <input id="book-copies" name="total_copies" type="number" min="1" defaultValue="1" required />
          </div>
          <button type="submit" className="btn btn-primary">Create Book</button>
        </form>
      )}

      {books.length === 0 ? (
        <div className="empty-state">
          <p>No books in the catalog yet.</p>
          <p>Click &quot;Add Book&quot; to add the first one.</p>
        </div>
      ) : (
        <div className="grid">
          {books.map((book) => (
            <Link
              key={book.id}
              to={`/books/${book.id}`}
              className={`card card-link${book.id === highlightId ? ' highlight' : ''}`}
              style={book.id === highlightId ? { outline: '2px solid var(--color-primary)' } : undefined}
            >
              <h3>{book.title}</h3>
              <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem' }}>by {book.author}</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>ISBN: {book.isbn}</p>
              <p style={{ marginTop: '0.5rem' }}>
                {book.available_copies > 0 ? (
                  <span className="badge badge-success">{book.available_copies} of {book.total_copies} available</span>
                ) : (
                  <span className="badge badge-danger">All copies on loan</span>
                )}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}