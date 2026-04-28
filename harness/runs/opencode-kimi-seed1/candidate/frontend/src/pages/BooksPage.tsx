import { Link } from 'react-router-dom';
import { useFetch } from '../hooks/useApi';
import type { Book } from '../types';
import { Loading, ErrorMessage, EmptyState } from '../components/Status';

function BookCard({ book }: { book: Book }) {
  const isAvailable = book.available_copies > 0;
  const isAllOnLoan = book.available_copies === 0;

  return (
    <Link to={`/books/${book.id}`} className="book-card">
      <h3>{book.title}</h3>
      <p className="book-author">by {book.author}</p>
      <p className="book-isbn">ISBN: {book.isbn}</p>
      <div className="book-availability">
        {isAllOnLoan ? (
          <span className="unavailable">All copies on loan</span>
        ) : (
          <span className={isAvailable ? 'available' : 'unavailable'}>
            {book.available_copies} of {book.total_copies} available
          </span>
        )}
      </div>
    </Link>
  );
}

export function BooksPage() {
  const { data: books, loading, error, refetch } = useFetch<Book[]>('/api/books');

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;
  if (!books || books.length === 0) {
    return (
      <EmptyState
        message="No books in the catalog yet."
        action={<Link to="/checkout" className="btn btn-primary">Go to Checkout to add books</Link>}
      />
    );
  }

  return (
    <div className="page">
      <h1>Book Catalog</h1>
      <div className="books-grid">
        {books.map(book => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>
    </div>
  );
}
