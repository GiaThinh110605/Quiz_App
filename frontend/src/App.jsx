import React from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import QuizPage from './pages/QuizPage';
import './App.css';

// Placeholder pages - tạo các file này sau
const HomePage = () => (
  <div className="home-page">
    <h1>Chào mừng đến Quiz App</h1>
    <div className="home-actions">
      <Link to="/quiz" className="btn-primary">Bắt đầu làm bài</Link>
    </div>
  </div>
);

const ProfilePage = () => (
  <div className="profile-page">
    <h1>Thông tin cá nhân</h1>
    <p>Tính năng đang phát triển...</p>
  </div>
);

const AdminPage = () => (
  <div className="admin-page">
    <h1>Trang quản trị</h1>
    <p>Chỉ dành cho admin...</p>
  </div>
);

const UnauthorizedPage = () => (
  <div className="unauthorized-page">
    <h1>403 - Không có quyền truy cập</h1>
    <p>Bạn không có quyền xem trang này.</p>
    <Link to="/">Về trang chủ</Link>
  </div>
);

// Navigation component
const Navbar = () => {
  const { user, isAuthenticated, logout, isAdmin } = useAuth();

  return (
    <nav className="navbar">
      <div className="nav-brand">
        <Link to="/">Quiz App</Link>
      </div>
      <div className="nav-links">
        <Link to="/">Trang chủ</Link>
        {isAuthenticated && <Link to="/quiz">Làm bài</Link>}
        {isAuthenticated && <Link to="/profile">Hồ sơ</Link>}
        {isAdmin && <Link to="/admin">Quản trị</Link>}
      </div>
      <div className="nav-auth">
        {isAuthenticated ? (
          <>
            <span>Xin chào, {user?.username}</span>
            <button onClick={logout} className="btn-logout">Đăng xuất</button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn-login">Đăng nhập</Link>
            <Link to="/register" className="btn-register">Đăng ký</Link>
          </>
        )}
      </div>
    </nav>
  );
};

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="App">
      <Navbar />
      <main className="main-content">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route 
            path="/login" 
            element={isAuthenticated ? <Navigate to="/" /> : <LoginForm />} 
          />
          <Route 
            path="/register" 
            element={isAuthenticated ? <Navigate to="/" /> : <RegisterForm />} 
          />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* Protected routes */}
          <Route 
            path="/quiz" 
            element={
              <ProtectedRoute>
                <QuizPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/profile" 
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            } 
          />

          {/* Admin only routes */}
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminPage />
              </ProtectedRoute>
            } 
          />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
