import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Brain } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, clearApiCache } from '../hooks/api';
import { useAuth } from '../store/auth';

export default function Signup() {
  const navigate = useNavigate();
  const { setAuth, token } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthConfig, setOauthConfig] = useState({ google: false, github: false, wechat: false });

  useEffect(() => {
    if (token) navigate('/', { replace: true });
    api.getAuthConfig().then((r) => setOauthConfig(r.data)).catch(() => {});
  }, [token, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.signup({ email, password, display_name: displayName });
      if (res.data?.token) {
        clearApiCache();
        setAuth(res.data.token, res.data.user);
        navigate('/', { replace: true });
      } else {
        // Email verification required
        toast.success(res.message || 'Check your email to verify your account');
        navigate('/login');
      }
    } catch (err: any) {
      toast.error(err.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center mb-3">
            <Brain size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="At least 6 characters"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          {(oauthConfig.google || oauthConfig.github || oauthConfig.wechat) && (
            <>
              <div className="flex items-center my-4">
                <div className="flex-1 border-t border-gray-100" />
                <span className="mx-3 text-xs text-gray-400">or sign up with</span>
                <div className="flex-1 border-t border-gray-100" />
              </div>
              <div className="flex gap-2">
                {oauthConfig.google && (
                  <a
                    href="/api/auth/oauth/google"
                    className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Google
                  </a>
                )}
                {oauthConfig.github && (
                  <a
                    href="/api/auth/oauth/github"
                    className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                    </svg>
                    GitHub
                  </a>
                )}
                {oauthConfig.wechat && (
                  <a
                    href="/api/auth/oauth/wechat"
                    className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="#07C160" viewBox="0 0 24 24">
                      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-3.938-6.348-7.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045.245.245 0 0 0 .24-.245c0-.06-.023-.12-.04-.177l-.325-1.233a.492.492 0 0 1 .176-.554 5.512 5.512 0 0 0 2.5-4.624c0-3.372-3.11-6.1-6.858-6.12zm-2.162 3.652c.535 0 .97.44.97.983a.976.976 0 0 1-.97.983.976.976 0 0 1-.97-.983c0-.543.434-.983.97-.983zm4.325 0c.535 0 .97.44.97.983a.976.976 0 0 1-.97.983.976.976 0 0 1-.97-.983c0-.543.434-.983.97-.983z"/>
                    </svg>
                    WeChat
                  </a>
                )}
              </div>
            </>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
