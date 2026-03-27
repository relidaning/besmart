
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import Todos from './pages/Todos';
import FinishedTodos from './pages/FinishedTodos';
import Categories from './pages/Categories';
import Login from './pages/Login';
import Register from './pages/Register';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/todos" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="todos" element={<Todos />} />
            <Route path="todos/finished" element={<FinishedTodos />} />
            <Route path="categories" element={<Categories />} />
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;