import { Link, useLocation } from 'react-router-dom';
import { useSelectedMember } from '../contexts/MemberContext';

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { selectedMember } = useSelectedMember();

  const navItems = [
    { path: '/books', label: 'Catalog' },
    { path: '/members', label: 'Members' },
    { path: '/checkout', label: 'Checkout' },
  ];

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>
            <Link to="/" className="logo">
              📚 Library Lending
            </Link>
          </h1>
          {selectedMember && (
            <div className="selected-member">
              <span className="label">Acting for:</span>
              <Link to={`/members/${selectedMember.id}`} className="member-name">
                {selectedMember.name}
              </Link>
            </div>
          )}
        </div>
        <nav className="main-nav">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={location.pathname.startsWith(item.path) ? 'active' : ''}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {children}
      </main>

      <footer className="app-footer">
        <p>Library Lending System</p>
      </footer>
    </div>
  );
}
