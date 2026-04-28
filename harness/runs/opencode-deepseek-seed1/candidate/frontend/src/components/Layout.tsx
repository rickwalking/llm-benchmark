import { NavLink } from 'react-router-dom';
import { useApp } from '../context';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { selectedMember, setSelectedMember, members } = useApp();

  return (
    <div>
      <nav className="nav" role="navigation" aria-label="Main navigation">
        <NavLink to="/books" className={({ isActive }) => isActive ? 'active' : ''}>
          Catalog
        </NavLink>
        <NavLink to="/members" className={({ isActive }) => isActive ? 'active' : ''}>
          Members
        </NavLink>
        <NavLink to="/checkout" className={({ isActive }) => isActive ? 'active' : ''}>
          Checkout
        </NavLink>

        <div className="member-selector">
          <label htmlFor="member-select" style={{ fontSize: '12px', marginBottom: 0 }}>
            Acting as:
          </label>
          <select
            id="member-select"
            value={selectedMember?.id ?? ''}
            onChange={(e) => {
              const member = members.find(m => m.id === e.target.value);
              setSelectedMember(member ?? null);
            }}
            aria-label="Select member to act as"
          >
            <option value="">-- Select member --</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} {m.status === 'suspended' ? '(suspended)' : ''}
              </option>
            ))}
          </select>
        </div>
      </nav>
      <main className="container">
        {children}
      </main>
      <footer className="footer">
        Library Lending System
      </footer>
    </div>
  );
}
