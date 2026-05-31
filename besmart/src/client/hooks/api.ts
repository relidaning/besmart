import { useAuth } from '../store/auth';

const BASE = '/api';

const _cache = new Map<string, { data: unknown; at: number }>();
const TTL = 30_000;

export function clearApiCache() {
  _cache.clear();
}

function authHeaders(): HeadersInit {
  const token = useAuth.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase();

  if (method === 'GET') {
    const hit = _cache.get(url);
    if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  }

  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    ...options,
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

  if (method === 'GET') {
    _cache.set(url, { data, at: Date.now() });
  } else {
    const resource = url.split('/')[1];
    for (const k of _cache.keys()) {
      if (k.split('/')[1] === resource) _cache.delete(k);
    }
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
  getDueReviews: () => request<any>('/reviews/due'),
  completeReview: (id: number, rating: 'hard' | 'ok' | 'easy') =>
    request<any>(`/reviews/records/${id}/complete`, { method: 'POST', body: JSON.stringify({ rating }) }),
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
  rematchVault: () => request<any>('/reviews/courses/rematch', { method: 'POST' }),
  syncVault: () => request<any>('/reviews/vault/sync', { method: 'POST' }),
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
};
