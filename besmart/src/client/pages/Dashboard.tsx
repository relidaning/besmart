import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FolderOpen, ClipboardCheck, RefreshCw, ListTodo, Flame, Moon, Sun, PartyPopper, Zap } from 'lucide-react';
import { api } from '../hooks/api';
import { useEffect, useState } from 'react';

interface ScoreRecord {
  id: number;
  score_date: string;
  score: number;
}

function ScoreChart({ scores }: { scores: ScoreRecord[] }) {
  if (scores.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">No score data yet.</p>;
  }

  const max = Math.max(...scores.map((s) => s.score), 1);
  const chartH = 80;
  const barW = 20;
  const gap = 6;
  const totalW = scores.length * (barW + gap) - gap;

  return (
    <div className="overflow-x-auto">
      <svg width={totalW} height={chartH + 24} className="block mx-auto">
        {scores.map((s, i) => {
          const barH = Math.max(2, Math.round((s.score / max) * chartH));
          const x = i * (barW + gap);
          const y = chartH - barH;
          const label = s.score_date.slice(5); // MM-DD
          return (
            <g key={s.score_date}>
              <title>{s.score_date}: {s.score} pts</title>
              <rect x={x} y={y} width={barW} height={barH} rx={3} className="fill-brand-400 hover:fill-brand-500 transition-colors cursor-default" />
              <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" fontSize={9} className="fill-gray-400">{label}</text>
              {s.score > 0 && (
                <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={9} className="fill-gray-500">{s.score}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return { text: 'Night owl', Icon: Moon };
  if (hour < 12) return { text: 'Good morning', Icon: Sun };
  if (hour < 18) return { text: 'Good afternoon', Icon: Sun };
  return { text: 'Good evening', Icon: Moon };
}

interface Stats {
  studyplans: { active: number; completed: number; total: number };
  checkins: { today_total: number; today_completed: number; streak: number; score_today: number | null };
  reviews: { due_today: number; total_courses: number };
  todos: { active: number; completed: number; overdue: number; high_priority: number };
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [scores, setScores] = useState<ScoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { text: greetingText, Icon: GreetingIcon } = getGreeting();

  useEffect(() => {
    const end = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 13);
    const start = startDate.toISOString().split('T')[0];

    Promise.all([
      api.getStats().then((r) => setStats(r.data)),
      api.getScores(start, end).then((r) => {
        const sorted = [...r.data].sort((a: ScoreRecord, b: ScoreRecord) =>
          a.score_date.localeCompare(b.score_date)
        );
        setScores(sorted);
      }),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  const checkinProgress = stats.checkins.today_total > 0
    ? Math.round((stats.checkins.today_completed / stats.checkins.today_total) * 100)
    : 0;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 md:ml-16">
      {/* Greeting */}
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <GreetingIcon size={24} className="text-gray-500" />
          {greetingText}
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </motion.div>

      {/* Check-in progress ring */}
      <motion.div variants={item}>
        <Link to="/checkin" className="card flex items-center gap-5 block">
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="#e5e7eb" strokeWidth="6" />
              <circle
                cx="40" cy="40" r="34" fill="none" stroke="#0c8ee9"
                strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - checkinProgress / 100)}`}
                className="progress-ring-circle"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-brand-600">{checkinProgress}%</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900">Today's Check-in</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {stats.checkins.today_completed}/{stats.checkins.today_total} tasks completed
            </p>
            <div className="flex items-center gap-3 mt-2">
              {stats.checkins.streak > 0 && (
                <span className="flex items-center gap-1 text-sm font-medium text-orange-500">
                  <Flame size={14} />
                  {stats.checkins.streak}-day streak
                </span>
              )}
              {stats.checkins.score_today !== null && (
                <span className="text-sm font-medium text-green-600">{stats.checkins.score_today} points today</span>
              )}
            </div>
          </div>
        </Link>
      </motion.div>

      {/* Four module cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            to: '/plans',
            icon: <FolderOpen size={24} className="text-blue-400" />,
            title: 'Study Plans',
            stat: `${stats.studyplans.active} active`,
            sub: `${stats.studyplans.completed} completed`,
            color: 'border-l-blue-400',
          },
          {
            to: '/checkin',
            icon: <ClipboardCheck size={24} className="text-green-400" />,
            title: 'Check In',
            stat: `${stats.checkins.today_completed}/${stats.checkins.today_total}`,
            sub: 'today',
            color: 'border-l-green-400',
          },
          {
            to: '/review',
            icon: <RefreshCw size={24} className="text-purple-400" />,
            title: 'Review',
            stat: `${stats.reviews.due_today} due`,
            sub: `${stats.reviews.total_courses} courses`,
            color: 'border-l-purple-400',
          },
          {
            to: '/todos',
            icon: <ListTodo size={24} className={stats.todos.overdue > 0 ? 'text-red-400' : 'text-yellow-400'} />,
            title: 'Todos',
            stat: `${stats.todos.active} active`,
            sub: stats.todos.overdue > 0 ? `${stats.todos.overdue} overdue` : `${stats.todos.completed} done`,
            color: stats.todos.overdue > 0 ? 'border-l-red-400' : 'border-l-yellow-400',
          },
        ].map((card) => (
          <motion.div key={card.to} variants={item}>
            <Link to={card.to} className={`card border-l-4 ${card.color} block p-4`}>
              {card.icon}
              <h3 className="font-semibold text-sm mt-2">{card.title}</h3>
              <p className="text-lg font-bold mt-1">{card.stat}</p>
              <p className="text-xs text-gray-400">{card.sub}</p>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Quick stats */}
      <motion.div variants={item} className="card">
        <h2 className="font-semibold text-gray-900 mb-4">At a Glance</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-orange-500">{stats.checkins.streak}</div>
            <div className="text-xs text-gray-500 mt-1">Day Streak</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-500">{stats.reviews.due_today}</div>
            <div className="text-xs text-gray-500 mt-1">Reviews Due</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-500">{stats.todos.high_priority}</div>
            <div className="text-xs text-gray-500 mt-1">High Priority</div>
          </div>
        </div>
      </motion.div>

      {/* Score history chart */}
      <motion.div variants={item} className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Daily Scores (last 14 days)</h2>
          {scores.length > 0 && (
            <span className="text-xs text-gray-400">
              Total: {scores.reduce((sum, s) => sum + s.score, 0)} pts
            </span>
          )}
        </div>
        <ScoreChart scores={scores} />
      </motion.div>

      {/* Encouragement */}
      {checkinProgress === 100 && stats.checkins.today_total > 0 && (
        <motion.div
          variants={item}
          className="card bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 text-center"
        >
          <div className="flex justify-center mb-2 text-green-600"><PartyPopper size={40} /></div>
          <h3 className="font-semibold text-green-800">All caught up for today!</h3>
          <p className="text-sm text-green-600 mt-1">Great job completing all your check-ins.</p>
        </motion.div>
      )}

      {checkinProgress < 100 && stats.checkins.today_total > 0 && (
        <motion.div variants={item} className="card bg-gradient-to-r from-brand-50 to-blue-50 border-brand-100 text-center">
          <div className="flex justify-center mb-2 text-brand-600"><Zap size={40} /></div>
          <h3 className="font-semibold text-brand-800">Keep going!</h3>
          <p className="text-sm text-brand-600 mt-1">
            {stats.checkins.today_total - stats.checkins.today_completed} tasks left to complete today.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
