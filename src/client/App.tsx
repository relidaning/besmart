import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './store/auth';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Plans from './pages/Plans';
import PlanDetail from './pages/PlanDetail';
import CheckIn from './pages/CheckIn';
import Review from './pages/Review';
import ReviewContent from './pages/ReviewContent';
import Todos from './pages/Todos';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AuthCallback from './pages/AuthCallback';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 2000,
          style: { borderRadius: '12px', padding: '12px 16px', fontSize: '14px' },
        }}
      />
      <Routes>
        {/* Auth pages */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected app */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="plans" element={<Plans />} />
          <Route path="plans/:id" element={<PlanDetail />} />
          <Route path="checkin" element={<CheckIn />} />
          <Route path="review" element={<Review />} />
          <Route path="review/record/:id" element={<ReviewContent />} />
          <Route path="review/course/:id" element={<ReviewContent />} />
          <Route path="todos" element={<Todos />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
