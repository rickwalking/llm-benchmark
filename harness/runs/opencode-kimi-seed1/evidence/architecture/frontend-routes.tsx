import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MemberProvider } from './contexts/MemberContext';
import { Layout } from './components/Layout';
import { BooksPage } from './pages/BooksPage';
import { BookDetailPage } from './pages/BookDetailPage';
import { MembersPage } from './pages/MembersPage';
import { MemberDetailPage } from './pages/MemberDetailPage';
import { CheckoutPage } from './pages/CheckoutPage';

function App() {
  return (
    <MemberProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/books" replace />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/books/:id" element={<BookDetailPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/members/:id" element={<MemberDetailPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </MemberProvider>
  );
}

export default App;
