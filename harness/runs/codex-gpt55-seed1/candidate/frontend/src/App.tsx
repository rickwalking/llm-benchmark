import type { ReactElement } from "react";
import { BookOpen, ClipboardList, Users } from "lucide-react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import BookDetailPage from "./pages/BookDetailPage";
import BooksPage from "./pages/BooksPage";
import CheckoutPage from "./pages/CheckoutPage";
import MemberProfilePage from "./pages/MemberProfilePage";
import MembersPage from "./pages/MembersPage";

export default function App(): ReactElement {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Public library desk</p>
          <h1>Library Lending</h1>
        </div>
        <nav aria-label="Main navigation">
          <NavLink to="/books">
            <BookOpen aria-hidden="true" size={18} /> Books
          </NavLink>
          <NavLink to="/members">
            <Users aria-hidden="true" size={18} /> Members
          </NavLink>
          <NavLink to="/checkout">
            <ClipboardList aria-hidden="true" size={18} /> Checkout
          </NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route element={<Navigate to="/books" replace />} path="/" />
          <Route element={<BooksPage />} path="/books" />
          <Route element={<BookDetailPage />} path="/books/:id" />
          <Route element={<MembersPage />} path="/members" />
          <Route element={<MemberProfilePage />} path="/members/:id" />
          <Route element={<CheckoutPage />} path="/checkout" />
        </Routes>
      </main>
      <footer>Local lending records update immediately after each desk action.</footer>
    </div>
  );
}
