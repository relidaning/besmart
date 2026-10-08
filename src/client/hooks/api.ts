import { useAuth } from '../store/auth';
import { celebrate } from '../lib/garden';

const BASE = '/api';

const _cache = new Map<string, { data: unknown; at: number }>();
const TTL = 30_000;
// GETs on their way, so components that ask for the same URL at once (Layout and the
// page both want /dashboard/stats on every page change) share one request.
const _inflight = new Map<string, Promise<unknown>>();

export function clearApiCache() {
  _cache.clear();
  _inflight.clear();
}

function authHeaders(): HeadersInit {
  const token = useAuth.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// `quiet` skips the XP toast, for callers that show it themselves with more detail.
async function request<T>(url: string, options?: RequestInit, { quiet = false } = {}): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase();
  if (method !== 'GET') return send<T>(url, method, options, quiet);

  const hit = _cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  const pending = _inflight.get(url);
  if (pending) return pending as Promise<T>;

  const p: Promise<T> = send<T>(url, method, options, quiet).then((data) => {
    // A mutation or logout since this was sent took it out of the map: the answer may
    // predate that change, so it goes to its callers but not into the cache.
    if (_inflight.get(url) === p) {
      // Search and paging URLs would otherwise pile up for as long as the page lives.
      if (_cache.size >= 100) {
        const now = Date.now();
        for (const [k, v] of _cache) if (now - v.at >= TTL) _cache.delete(k);
      }
      _cache.set(url, { data, at: Date.now() });
    }
    return data;
  }).finally(() => {
    if (_inflight.get(url) === p) _inflight.delete(url);
  });
  _inflight.set(url, p);
  return p;
}

async function send<T>(url: string, method: string, options: RequestInit | undefined, quiet: boolean): Promise<T> {
  // A connection that died while the phone slept can leave fetch pending forever,
  // freezing whatever waits on it, so give up after 15 s and let the user retry.
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    signal: AbortSignal.timeout(15_000),
    ...options,
  }).catch((err) => {
    throw new Error(err?.name === 'TimeoutError' ? 'The server took too long to answer. Try again.' : 'Network error. Try again.');
  });

  if (res.status === 401) {
    useAuth.getState().clearAuth();
    clearApiCache();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  const data = await res.json();

  if (method !== 'GET') {
    const resource = url.split('/')[1];
    for (const m of [_cache, _inflight]) {
      for (const k of m.keys()) {
        const r = k.split('?')[0].split('/')[1];
        // Any completion can move XP, so garden/dashboard views are always stale after a mutation.
        if (r === resource || r === 'garden' || r === 'dashboard') m.delete(k);
      }
    }
    if (!quiet) celebrate(data?.xp);
    celebrate(data?.bonus, 'Check-in done'); // the "Complete 5 todos" check-in ticked itself
    if (data?.xp || data?.bonus) window.dispatchEvent(new Event('besmart:xp')); // AchievementWatcher
  }

  return data;
}

export const api = {
  // Auth
  getAuthConfig: () => request<any>('/auth/config'),
  signup: (data: any) => request<any>('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: any) => request<any>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  forgotPassword: (email: string) => request<any>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => request<any>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  getMe: () => request<any>('/auth/me'),

  // Dashboard
  getStats: () => request<any>('/dashboard/stats'),

  // Study Plans
  getPlans: () => request<any>('/plans'),
  getPlan: (id: number) => request<any>(`/plans/${id}`),
  createPlan: (data: any) => request<any>('/plans', { method: 'POST', body: JSON.stringify(data) }),
  updatePlan: (id: number, data: any) => request<any>(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePlan: (id: number) => request<any>(`/plans/${id}`, { method: 'DELETE' }),
  completePlan: (id: number) => request<any>(`/plans/${id}/complete`, { method: 'POST' }),
  createPlanTask: (planId: number, data: any) => request<any>(`/plans/${planId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
  updatePlanTask: (planId: number, taskId: number, data: any) => request<any>(`/plans/${planId}/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePlanTask: (planId: number, taskId: number) => request<any>(`/plans/${planId}/tasks/${taskId}`, { method: 'DELETE' }),
  indentPlanTask: (planId: number, taskId: number) => request<any>(`/plans/${planId}/tasks/${taskId}/indent`, { method: 'POST' }),
  outdentPlanTask: (planId: number, taskId: number) => request<any>(`/plans/${planId}/tasks/${taskId}/outdent`, { method: 'POST' }),
  movePlanTask: (planId: number, taskId: number, direction: 'up' | 'down') =>
    request<any>(`/plans/${planId}/tasks/${taskId}/move`, { method: 'POST', body: JSON.stringify({ direction }) }),

  // Check-ins
  getTodayCheckins: (date?: string) => request<any>(`/checkins/today${date ? `?date=${date}` : ''}`),
  completeCheckin: (id: number) => request<any>(`/checkins/tasks/${id}/complete`, { method: 'POST' }),
  uncompleteCheckin: (id: number) => request<any>(`/checkins/tasks/${id}/uncomplete`, { method: 'POST' }),
  getSchedules: () => request<any>('/checkins/schedules'),
  createSchedule: (data: any) => request<any>('/checkins/schedules', { method: 'POST', body: JSON.stringify(data) }),
  updateSchedule: (id: number, data: any) => request<any>(`/checkins/schedules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSchedule: (id: number) => request<any>(`/checkins/schedules/${id}`, { method: 'DELETE' }),
  getScores: (start?: string, end?: string) => request<any>(`/checkins/scores${start ? `?start=${start}&end=${end}` : ''}`),
  getStreak: () => request<any>('/checkins/streak'),

  // Reviews
  getDueReviews: (search?: string) => request<any>(`/reviews/due${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  addDiaryEntry: (text: string, type: string = 'daily', previous = false) =>
    request<{ success: boolean; path: string; heading: string }>('/checkins/diary', { method: 'POST', body: JSON.stringify({ text, type, previous }) }),
  completeReview: (id: number, rating: 'again' | 'hard' | 'ok' | 'easy') =>
    request<any>(`/reviews/records/${id}/complete`, { method: 'POST', body: JSON.stringify({ rating }) }, { quiet: true }),
  getCourses: () => request<any>('/reviews/courses'),
  createCourse: (data: any) => request<any>('/reviews/courses', { method: 'POST', body: JSON.stringify(data) }),
  updateCourse: (id: number, data: any) => request<any>(`/reviews/courses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCourse: (id: number) => request<any>(`/reviews/courses/${id}`, { method: 'DELETE' }),
  getRecordDetail: (id: number) => request<any>(`/reviews/records/${id}/detail`),
  getCourseDetail: (id: number) => request<any>(`/reviews/courses/${id}/detail`),
  getVaultInfo: () => request<any>('/reviews/vault/info'),
  getVaultSuggestions: () => request<any>('/reviews/vault/suggestions'),
  getVaultContent: (notePath: string) =>
    request<any>(`/reviews/vault/content?path=${encodeURIComponent(notePath)}`),
  importVaultNotes: (paths: string[]) =>
    request<any>('/reviews/vault/import', { method: 'POST', body: JSON.stringify({ paths }) }),
  getVaultConfig: () => request<any>('/reviews/vault/config'),
  setVaultConfig: (data: { vault_root?: string; vault_name?: string }) =>
    request<any>('/reviews/vault/config', { method: 'PUT', body: JSON.stringify(data) }),

  // Todos
  getTodos: (params?: any) => {
    const q = new URLSearchParams(params).toString();
    return request<any>(`/todos${q ? `?${q}` : ''}`);
  },
  createTodo: (data: any) => request<any>('/todos', { method: 'POST', body: JSON.stringify(data) }),
  updateTodo: (id: number, data: any) => request<any>(`/todos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  completeTodo: (id: number) => request<any>(`/todos/${id}/complete`, { method: 'POST' }),
  uncompleteTodo: (id: number) => request<any>(`/todos/${id}/uncomplete`, { method: 'POST' }),
  deleteTodo: (id: number) => request<any>(`/todos/${id}`, { method: 'DELETE' }),
  getTodoStats: () => request<any>('/todos/stats/overview'),

  // Growth Garden
  getGardenSummary: () => request<any>('/garden/summary'),
  getGardenPlants: () => request<any>('/garden/plants'),
  getGardenEvents: (params: { before?: number; plant?: number; limit?: number } = {}) =>
    request<any>(`/garden/events?${new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))}`),
  getGardenTrees: () => request<any>('/garden/trees'),

  // Music
  getMusicCatalog: () => request<any>('/music/catalog'),
  getMusicLibrary: () => request<any>('/music/library'),
  getSleepTracks: () => request<any>('/music/sleep'),
  addMusicTrack: (id: string) => request<any>('/music/library', { method: 'POST', body: JSON.stringify({ id }) }),
  removeMusicTrack: (id: string) => request<any>(`/music/library/${id}`, { method: 'DELETE' }),
};
