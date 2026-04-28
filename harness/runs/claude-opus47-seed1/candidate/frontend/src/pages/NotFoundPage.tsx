import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>That page doesn’t exist.</p>
      <p>
        <Link to="/books">Return to the catalog</Link>
      </p>
    </section>
  );
}
