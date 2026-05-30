import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Brain } from 'lucide-react';
import { useAuth } from '../store/auth';
import { clearApiCache, api } from '../hooks/api';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      navigate('/login?error=oauth_failed', { replace: true });
      return;
    }

    // Fetch user info with the token
    const tempStore = useAuth.getState();
    tempStore.setAuth(token, { id: 0, email: null, display_name: null, avatar_url: null });

    api.getMe()
      .then((res) => {
        clearApiCache();
        setAuth(token, res.data);
        navigate('/', { replace: true });
      })
      .catch(() => {
        navigate('/login?error=oauth_failed', { replace: true });
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center">
          <Brain size={24} className="text-white" />
        </div>
        <p className="text-sm text-gray-500">Signing you in…</p>
      </div>
    </div>
  );
}
