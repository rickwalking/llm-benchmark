import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context';
import Layout from './components/Layout';
import BooksPage from './pages/BooksPage';
import BookDetailPage from './pages/BookDetailPage';
import MembersPage from './pages/MembersPage';
import MemberProfilePage from './pages/MemberProfilePage';
import CheckoutPage from './pages/CheckoutPage';

export default function App() {
  return (
    <AppProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/books" replace />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/books/:id" element={<BookDetailPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/members/:id" element={<MemberProfilePage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
        </Routes>
      </Layout>
    </AppProvider>
  );
}
