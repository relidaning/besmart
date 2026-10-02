import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Brain, Flame, Home, ClipboardCheck, ListTodo, RefreshCw, FolderOpen, Sprout, LogOut, Sun, Moon, MonitorSmartphone } from 'lucide-react';
import { api, clearApiCache } from '../hooks/api';
import { checkForUpdate } from '../lib/autoUpdate';
import { useAuth } from '../store/auth';
import { useTheme } from '../contexts/ThemeContext';
import MusicPlayer from './MusicPlayer';

// Its modal pulls in the garden art, so it loads in its own chunk.
const AchievementWatcher = lazy(() => import('./AchievementWatcher'));

const THEME_CYCLE = ['system', 'light', 'dark'] as const;
const THEME_ICON = { system: MonitorSmartphone, light: Sun, dark: Moon };
const THEME_LABEL = { system: 'System theme', light: 'Light mode', dark: 'Dark mode' };

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = THEME_ICON[theme];
  return (
    <button
      onClick={() => {
        const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
        setTheme(next);
      }}
      className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
      title={`${THEME_LABEL[theme]} — click to change`}
    >
      <Icon size={16} />
    </button>
  );
}

type PushStatus = 'idle' | 'subscribed' | 'denied' | 'unsupported';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const navItems = [
  { path: '/', icon: <Home size={18} />, label: 'Home' },
  { path: '/checkin', icon: <ClipboardCheck size={18} />, label: 'Check In' },
  { path: '/todos', icon: <ListTodo size={18} />, label: 'Todos' },
  { path: '/review', icon: <RefreshCw size={18} />, label: 'Review' },
  { path: '/plans', icon: <FolderOpen size={18} />, label: 'Plans' },
  { path: '/garden', icon: <Sprout size={18} />, label: 'Garden' },
];

// Top-bar title per route, so the current page stays named while scrolling.
const SECTION_TITLE: [string, string][] = [
  ['/', 'Home'], ['/checkin', 'Check In'], ['/todos', 'Todos'], ['/review', 'Review'],
  ['/plans', 'Study Plans'], ['/garden', 'Garden'], ['/music', 'Music'],
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
    checkForUpdate('route');
  }, [location.pathname]);

  useEffect(() => {
    api.getStats().then((r) => {
      setStreak(r.data.checkins.streak);
      setScoreToday(r.data.checkins.score_today);
    }).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') { setPushStatus('denied'); return; }
    // A subscription is bound to the server's VAPID key. When the key has changed (it
    // was rotated), replace it; otherwise re-register it, so the server's list stays
    // in step with the phone. If the browser won't resubscribe without a tap, the bell
    // shows off and a tap subscribes again.
    navigator.serviceWorker.ready.then(async (reg) => {
      swRegRef.current = reg;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { setPushStatus('idle'); return; }
      const { publicKey } = await fetch('/api/notifications/vapid-public-key').then((r) => r.json());
      const serverKey = urlBase64ToUint8Array(publicKey);
      const ownKey = sub.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
      let current: PushSubscription = sub;
      if (!ownKey || ownKey.length !== serverKey.length || ownKey.some((b, i) => b !== serverKey[i])) {
        await sub.unsubscribe();
        try {
          current = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });
        } catch { setPushStatus('idle'); return; }
      }
      await saveSubscription(current);
      setPushStatus('subscribed');
    }).catch(() => {});
  }, []);

  async function saveSubscription(sub: PushSubscription) {
    await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${useAuth.getState().token}` },
      body: JSON.stringify(sub),
    });
  }

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
      await saveSubscription(sub);
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

  const section = SECTION_TITLE.find(([prefix]) =>
    prefix === '/' ? location.pathname === '/' : location.pathname.startsWith(prefix))?.[1] ?? 'BeSmart';

  const initials = user?.display_name
    ? user.display_name.slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? '?';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      {/* Fixed, not sticky: html/body's overflow-x: hidden stops sticky from holding on iOS. */}
      <header className="fixed top-0 inset-x-0 z-40 bg-white/85 backdrop-blur-lg border-b border-gray-200/70 dark:bg-gray-950/85 dark:border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 text-[15px]">
            <NavLink to="/" className="flex items-center gap-2 font-bold text-gray-900 dark:text-gray-100 flex-shrink-0">
              <Brain size={20} className="text-brand-600 dark:text-brand-400" />
              <span className="hidden sm:inline">BeSmart</span>
            </NavLink>
            <span className="hidden sm:inline text-gray-300 dark:text-gray-700">/</span>
            <span className="font-bold text-gray-900 dark:text-gray-100 truncate">{section}</span>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3.5 flex-shrink-0">
            {streak > 0 && (
              <div className="flex items-center gap-0.5 text-xs text-gray-500 whitespace-nowrap" title="Check-in streak">
                <Flame size={13} className="text-[#d95926]" />
                <span>{streak}d</span>
              </div>
            )}
            {scoreToday !== null && (
              <div className="text-xs text-gray-500 whitespace-nowrap" title="Check-in points today">
                {scoreToday}<span className="hidden sm:inline"> pts</span><span className="sm:hidden">p</span>
              </div>
            )}

            <ThemeToggle />

            <MusicPlayer />

            {/* Push notifications toggle */}
            <button
              onClick={toggleNotifications}
              disabled={pushLoading || pushStatus === 'denied' || pushStatus === 'unsupported'}
              className={`transition-colors ${
                pushStatus === 'subscribed' ? 'text-brand-600 dark:text-brand-400' :
                pushStatus === 'unsupported' || pushStatus === 'denied' ? 'text-gray-300 dark:text-gray-700 cursor-not-allowed' :
                'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
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
                <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 flex items-center justify-center text-[11px] font-bold dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-gray-300">
                  {initials}
                </div>
              )}
              <button
                onClick={handleLogout}
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 pt-[72px] pb-24 md:pb-6 overflow-x-hidden" style={{ touchAction: 'pan-y' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {/* Keep header/nav on screen while a lazy page chunk loads */}
            <Suspense fallback={null}>
              <Outlet />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {user && <Suspense fallback={null}><AchievementWatcher userId={user.id} /></Suspense>}

      {/* Bottom nav (mobile) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/80 backdrop-blur-lg border-t border-gray-100 safe-area-bottom dark:bg-gray-950/80 dark:border-white/[0.08]">
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map((item) => {
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-colors ${
                  isActive ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400 dark:text-gray-600'
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
      <aside className="hidden md:flex fixed left-0 top-12 bottom-0 w-16 bg-white border-r border-gray-100 flex-col items-center py-4 gap-1 z-30 dark:bg-gray-950 dark:border-white/[0.08]">
        {navItems.map((item) => {
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`w-11 h-11 flex flex-col items-center justify-center rounded-xl transition-colors ${
                isActive
                  ? 'bg-gray-100 text-brand-600 dark:bg-white/[0.06] dark:text-brand-400'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-600 dark:hover:bg-white/[0.04] dark:hover:text-gray-300'
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
