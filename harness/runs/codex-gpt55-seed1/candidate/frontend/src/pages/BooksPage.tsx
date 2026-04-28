import { Plus, RefreshCw } from "lucide-react";
import type { ReactElement } from "react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import Message from "../components/Message";
import type { Book } from "../types";
import { availabilityText } from "../utils";

const emptyForm = { title: "", author: "", isbn: "", total_copies: 1 };

export default function BooksPage(): ReactElement {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(emptyForm);

  async function load(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      setBooks(await api.books());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load books");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api.createBook(form);
      setForm(emptyForm);
      setNotice("Book added to the catalog.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add book");
    }
  }

  return (
    <div className="page-grid">
      <section>
        <div className="section-title">
          <div>
            <p className="eyebrow">Catalog</p>
            <h2>Books</h2>
          </div>
          <button className="secondary" onClick={() => void load()} type="button">
            <RefreshCw aria-hidden="true" size={16} /> Refresh
          </button>
        </div>
        {loading ? <p className="empty-state">Loading catalog…</p> : null}
        {error ? <Message kind="error">{error}</Message> : null}
        {!loading && books.length === 0 ? <p className="empty-state">No books are in the catalog yet.</p> : null}
        <div className="list">
          {books.map((book) => (
            <Link className="list-row book-row" key={book.id} to={`/books/${book.id}`}>
              <span>
                <strong>{book.title}</strong>
                <small>{book.author} · ISBN {book.isbn}</small>
              </span>
              <span className={book.available_copies === 0 ? "pill danger" : "pill"}>
                {availabilityText(book.available_copies, book.total_copies, book.reservation_queue_depth)}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <aside className="side-panel" aria-labelledby="add-book-heading">
        <h2 id="add-book-heading">Add Book</h2>
        {notice ? <Message kind="success">{notice}</Message> : null}
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Title
            <input
              required
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>
          <label>
            Author
            <input
              required
              value={form.author}
              onChange={(event) => setForm({ ...form, author: event.target.value })}
            />
          </label>
          <label>
            ISBN
            <input
              required
              value={form.isbn}
              onChange={(event) => setForm({ ...form, isbn: event.target.value })}
            />
          </label>
          <label>
            Total copies
            <input
              min={1}
              required
              type="number"
              value={form.total_copies}
              onChange={(event) => setForm({ ...form, total_copies: Number(event.target.value) })}
            />
          </label>
          <button type="submit">
            <Plus aria-hidden="true" size={16} /> Add book
          </button>
        </form>
      </aside>
    </div>
  );
}
