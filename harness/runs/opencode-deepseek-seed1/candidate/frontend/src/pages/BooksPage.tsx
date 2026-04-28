import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type Book } from '../api';
import CreateBookModal from '../components/CreateBookModal';

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadBooks = () => {
    api.books.list()
      .then(setBooks)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load books'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBooks();
  }, []);

  if (loading) {
    return <div className="loading"><span className="spinner" /> Loading catalog...</div>;
  }

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px' }}>Book Catalog</h1>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>Add New Book</button>
      </div>

      {books.length === 0 ? (
        <div className="empty-state">
          <h3>No books in catalog</h3>
          <p>Add books to get started with your library.</p>
        </div>
      ) : (
        <div className="card">
          <table className="table" aria-label="Book catalog">
            <thead>
              <tr>
                <th>Title</th>
                <th>Author</th>
                <th>ISBN</th>
                <th>Availability</th>
              </tr>
            </thead>
            <tbody>
              {books.map(book => (
                <tr key={book.id}>
                  <td>
                    <Link to={`/books/${book.id}`}>{book.title}</Link>
                  </td>
                  <td>{book.author}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{book.isbn}</td>
                  <td>
                    {book.available_copies > 0
                      ? <span className="badge badge-success">{book.available_copies} of {book.total_copies} available</span>
                      : <span className="badge badge-danger">All copies on loan</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateBookModal onClose={() => { setShowCreateModal(false); loadBooks(); }} />
      )}
    </div>
  );
}
