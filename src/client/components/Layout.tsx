import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Brain, Flame, Home, ClipboardCheck, ListTodo, RefreshCw, FolderOpen, LogOut } from 'lucide-react';
import { api, clearApiCache } from '../hooks/api';
import { useAuth } from '../store/auth';

type PushStatus = 'idle' | 'subscribed' | 'denied' | 'unsupported';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const navItems = [
  { path: '/', icon: <Home size={20} />, label: 'Home' },
  { path: '/checkin', icon: <ClipboardCheck size={20} />, label: 'Check In' },
  { path: '/todos', icon: <ListTodo size={20} />, label: 'Todos' },
  { path: '/review', icon: <RefreshCw size={20} />, label: 'Review' },
  { path: '/plans', icon: <FolderOpen size={20} />, label: 'Plans' },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, clearAuth } = useAuth();
  const [streak, setStreak] = useState(0);
  const [scoreToday, setScoreToday] = useState<number | null>(null);
  const [pushStatus, setPushStatus] = useState<PushStatus>('unsupported');
  const [pushLoading, setPushLoading] = useState(false);
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    api.getStats().then((r) => {
      setStreak(r.data.checkins.streak);
      setScoreToday(r.data.checkins.score_today);
    }).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') { setPushStatus('denied'); return; }
    navigator.serviceWorker.ready.then((reg) => {
      swRegRef.current = reg;
      return reg.pushManager.getSubscription();
    }).then((sub) => {
      setPushStatus(sub ? 'subscribed' : 'idle');
    }).catch(() => {});
  }, []);

  async function toggleNotifications() {
    if (pushLoading) return;
    const reg = swRegRef.current ?? await navigator.serviceWorker.ready;
    swRegRef.current = reg;

    if (pushStatus === 'subscribed') {
      setPushLoading(true);
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch('/api/notifications/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${useAuth.getState().token}` },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
      setPushStatus('idle');
      setPushLoading(false);
      return;
    }

    setPushLoading(true);
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { setPushStatus('denied'); setPushLoading(false); return; }

    try {
      const { publicKey } = await fetch('/api/notifications/vapid-public-key').then((r) => r.json());
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${useAuth.getState().token}` },
        body: JSON.stringify(sub),
      });
      setPushStatus('subscribed');
    } catch {
      setPushStatus('idle');
    } finally {
      setPushLoading(false);
    }
  }

  function handleLogout() {
    clearAuth();
    clearApiCache();
    navigate('/login', { replace: true });
  }

  const initials = user?.display_name
    ? user.display_name.slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? '?';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <NavLink to="/" className="flex items-center gap-2 font-bold text-lg text-brand-600">
            <Brain size={24} />
            <span className="hidden sm:inline">BeSmart</span>
          </NavLink>

          <div className="flex items-center gap-3">
            {streak > 0 && (
              <div className="flex items-center gap-1 text-sm font-medium text-orange-500">
                <Flame size={16} className="streak-flame" />
                <span>{streak}d</span>
              </div>
            )}
            {scoreToday !== null && (
              <div className="text-sm font-medium text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full">
                {scoreToday} pts
              </div>
            )}

            {/* Push notifications toggle */}
            <button
              onClick={toggleNotifications}
              disabled={pushLoading || pushStatus === 'denied' || pushStatus === 'unsupported'}
              className={`transition-colors ${
                pushStatus === 'subscribed' ? 'text-brand-500 hover:text-brand-700' :
                pushStatus === 'unsupported' || pushStatus === 'denied' ? 'text-gray-300 cursor-not-allowed' :
                'text-gray-400 hover:text-gray-600'
              }`}
              title={
                pushStatus === 'subscribed' ? 'Notifications on — click to disable' :
                pushStatus === 'unsupported' ? 'Push requires HTTPS or open from home screen PWA' :
                pushStatus === 'denied' ? 'Notifications blocked in browser settings' :
                'Enable notifications'
              }
            >
              {pushStatus === 'subscribed' ? <Bell size={16} /> : <BellOff size={16} />}
            </button>

            {/* User avatar + logout */}
            <div className="flex items-center gap-2">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
                  {initials}
                </div>
              )}
              <button
                onClick={handleLogout}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 pb-24 md:pb-6 overflow-x-hidden" style={{ touchAction: 'pan-y' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/80 backdrop-blur-lg border-t border-gray-100 safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map((item) => {
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${
                  isActive ? 'text-brand-600' : 'text-gray-400'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex fixed left-0 top-14 bottom-0 w-16 bg-white border-r border-gray-100 flex-col items-center py-4 gap-1 z-30">
        {navItems.map((item) => {
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`w-12 h-12 flex flex-col items-center justify-center rounded-xl transition-colors ${
                isActive ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
              }`}
              title={item.label}
            >
              <span className="text-xl">{item.icon}</span>
            </NavLink>
          );
        })}
      </aside>
    </div>
  );
}
