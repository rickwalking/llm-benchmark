import { Outlet, NavLink } from 'react-router';

export function Layout() {
  return (
    <>
      <nav>
        <NavLink to="/" className="brand">Library Lending</NavLink>
        <NavLink to="/books" end>Books</NavLink>
        <NavLink to="/members">Members</NavLink>
        <NavLink to="/checkout">Checkout</NavLink>
      </nav>
      <main>
        <Outlet />
      </main>
      <footer>
        <p>Library Lending System &mdash; Public Library Management</p>
      </footer>
    </>
  );
}