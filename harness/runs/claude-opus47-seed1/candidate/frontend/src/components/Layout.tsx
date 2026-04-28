import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="app-shell">
      <header className="top-nav" role="banner">
        <div className="top-nav__inner">
          <NavLink to="/books" className="top-nav__brand" aria-label="Library home">
            City Library
          </NavLink>
          <nav aria-label="Primary">
            <ul className="top-nav__links">
              <li>
                <NavLink to="/books">Books</NavLink>
              </li>
              <li>
                <NavLink to="/members">Members</NavLink>
              </li>
              <li>
                <NavLink to="/checkout">Checkout</NavLink>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="footer">City Library lending desk &middot; staff terminal</footer>
    </div>
  );
}
