import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './store/auth';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';

// Non-landing pages are split into their own chunks so the first load only ships
// the shell + Dashboard (ReviewContent alone pulls in markdown + syntax highlighting).
const Plans = lazy(() => import('./pages/Plans'));
const PlanDetail = lazy(() => import('./pages/PlanDetail'));
const CheckIn = lazy(() => import('./pages/CheckIn'));
const Review = lazy(() => import('./pages/Review'));
const ReviewContent = lazy(() => import('./pages/ReviewContent'));
const Todos = lazy(() => import('./pages/Todos'));
const MusicLibrary = lazy(() => import('./pages/MusicLibrary'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 2000,
        style: resolvedTheme === 'dark'
          ? { borderRadius: '12px', padding: '12px 16px', fontSize: '14px', background: '#27272a', color: '#f4f4f5' }
          : { borderRadius: '12px', padding: '12px 16px', fontSize: '14px' },
      }}
    />
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ThemedToaster />
        <Suspense fallback={null}>
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
            <Route path="music" element={<MusicLibrary />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
