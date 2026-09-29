import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Moon, Sun, ChevronRight, Shield, Sprout } from 'lucide-react';
import { api } from '../hooks/api';
import { useEffect, useState } from 'react';
import AttributeBar from '../components/AttributeBar';
import { PageHeader, CardHead } from '../components/PageKit';
import { Achievements, YearOfGrowth, type GardenSummary } from '../components/GardenStats';

interface ScoreRecord {
  id: number;
  score_date: string;
  score: number;
}

function ScoreChart({ scores }: { scores: ScoreRecord[] }) {
  if (scores.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No score data yet.</p>;
  }

  const max = Math.max(...scores.map((s) => s.score), 1);
  const chartH = 80;
  const slot = 24;
  const barW = 14;
  const totalW = scores.length * slot;

  // Scales to the card width (viewBox), so it never pushes the layout wider.
  return (
    <svg viewBox={`0 0 ${totalW} ${chartH + 30}`} className="block w-full h-auto max-h-44">
      {scores.map((s, i) => {
        const barH = s.score > 0 ? Math.max(2, Math.round((s.score / max) * chartH)) : 0;
        const x = i * slot + (slot - barW) / 2;
        const y = chartH - barH + 12;
        return (
          <g key={s.score_date}>
            <title>{s.score_date}: {s.score} pts</title>
            <rect x={x} y={12} width={barW} height={chartH} rx={3} className="fill-gray-200/60 dark:fill-white/[0.04]" />
            {barH > 0 && <rect x={x} y={y} width={barW} height={barH} rx={3} className="fill-brand-400" />}
            <text x={x + barW / 2} y={chartH + 26} textAnchor="middle" fontSize={8} className="fill-gray-500">{s.score_date.slice(8)}</text>
            {s.score > 0 && (
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={8} className="fill-gray-600 dark:fill-gray-300">{s.score}</text>
            )}
          </g>
        );
      })}
    </svg>
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
  const [garden, setGarden] = useState<GardenSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const { text: greetingText, Icon: GreetingIcon } = getGreeting();

  useEffect(() => {
    const end = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 13);
    const start = startDate.toISOString().split('T')[0];

    Promise.all([
      api.getStats().then((r) => setStats(r.data)),
      api.getGardenSummary().then((r) => setGarden(r.data)).catch(() => {}),
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

  const modules = [
    {
      to: '/checkin',
      title: 'Check In',
      dot: 'bg-[#1fa874]',
      stat: `${stats.checkins.today_completed}/${stats.checkins.today_total}`,
      sub: 'daily check-ins done today',
    },
    {
      to: '/todos',
      title: 'Todos',
      dot: stats.todos.overdue > 0 ? 'bg-[#e66666]' : 'bg-[#3987e5]',
      stat: `${stats.todos.active} active`,
      sub: stats.todos.overdue > 0
        ? `${stats.todos.overdue} overdue · ${stats.todos.high_priority} high priority`
        : `${stats.todos.high_priority} high priority`,
    },
    {
      to: '/review',
      title: 'Review',
      dot: 'bg-[#a854f7]',
      stat: `${stats.reviews.due_today} due`,
      sub: `${stats.reviews.total_courses} courses`,
    },
    {
      to: '/plans',
      title: 'Study Plans',
      dot: 'bg-brand-400',
      stat: `${stats.studyplans.active} active`,
      sub: `${stats.studyplans.completed} completed`,
    },
  ];
  const left = stats.checkins.today_total - stats.checkins.today_completed;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4 md:ml-16">
      <PageHeader
        icon={GreetingIcon}
        title={greetingText}
        subtitle={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr] lg:items-start [&>*]:min-w-0">
        <div className="space-y-4 lg:sticky lg:top-20">
          {/* Today: check-in ring + meters */}
          <motion.div variants={item}>
            <Link to="/checkin" className="card block">
              <CardHead
                title="Today"
                meta={stats.checkins.today_total > 0
                  ? left > 0 ? `${left} left` : 'all done'
                  : 'no check-ins'}
              />
              <div className="flex items-center gap-5">
                <div className="relative w-24 h-24 flex-shrink-0">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="7" className="text-gray-200/70 dark:text-white/[0.08]" />
                    <circle
                      cx="40" cy="40" r="34" fill="none" stroke="#fabf40"
                      strokeWidth="7" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 34}`}
                      strokeDashoffset={`${2 * Math.PI * 34 * (1 - checkinProgress / 100)}`}
                      className="progress-ring-circle"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{checkinProgress}%</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-2.5">
                  <div>
                    <div className="text-[11px] text-gray-500">Check-ins</div>
                    <div className="text-base font-bold text-gray-900 dark:text-gray-100">
                      {stats.checkins.today_completed}/{stats.checkins.today_total}
                    </div>
                  </div>
                  <div className="flex gap-5">
                    <div>
                      <div className="text-[11px] text-gray-500">Streak</div>
                      <div className="text-base font-bold text-gray-900 dark:text-gray-100">{stats.checkins.streak}d</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">Points</div>
                      <div className="text-base font-bold text-gray-900 dark:text-gray-100">{stats.checkins.score_today ?? 0}</div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>

          {/* Growth Garden */}
          {garden && (
            <motion.div variants={item} className="card">
              <CardHead
                title="Growth"
                meta={<>
                  +{garden.todayXp} XP today · {garden.streak.current}d streak
                  {garden.streak.shields > 0 && (
                    <span className="inline-flex items-center gap-0.5" title="Streak shields: a missed day uses one instead of breaking your streak">
                      · <Shield size={10} />{garden.streak.shields}
                    </span>
                  )}
                </>}
              />
              <div className="space-y-4">
                {garden.attributes.map((a) => <AttributeBar key={a.attribute} a={a} />)}
              </div>
              <Link to="/garden"
                className="row mt-4 flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                <Sprout size={15} className="text-[#1fa874] flex-shrink-0" />
                <span className="flex-1 min-w-0 text-[12px] text-gray-700 dark:text-gray-300">
                  {garden.seedsAvailable
                    ? <><b className="text-brand-600 dark:text-brand-400">{garden.seedsAvailable} rare seed{garden.seedsAvailable > 1 ? 's' : ''}</b> waiting to be planted</>
                    : 'Visit your garden'}
                </span>
                <ChevronRight size={14} className="text-gray-400 dark:text-gray-600" />
              </Link>
            </motion.div>
          )}
        </div>

        <div className="space-y-4">
          {/* Modules, as floatingsphere's session rows */}
          <motion.div variants={item} className="card">
            <CardHead title="Modules" />
            <div className="grid gap-1.5">
              {modules.map((m) => (
                <Link key={m.to} to={m.to}
                  className="row grid grid-cols-[10px_1fr_auto] items-start gap-x-2.5 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                  <span className={`dot mt-1.5 ${m.dot}`} />
                  <div className="min-w-0">
                    <div className="flex justify-between gap-2">
                      <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate">{m.title}</span>
                      <span className="text-[11px] text-gray-600 dark:text-gray-300 whitespace-nowrap">{m.stat}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5 truncate">{m.sub}</div>
                  </div>
                  <ChevronRight size={14} className="text-gray-400 dark:text-gray-600 mt-0.5" />
                </Link>
              ))}
            </div>
          </motion.div>

          {/* Score history chart */}
          <motion.div variants={item} className="card">
            <CardHead
              title="Daily scores"
              meta={scores.length > 0 ? `last 14 days · ${scores.reduce((sum, s) => sum + s.score, 0)} pts` : 'last 14 days'}
            />
            <ScoreChart scores={scores} />
          </motion.div>

          {garden && <YearOfGrowth data={garden} />}
          {garden && <Achievements data={garden} />}
        </div>
      </div>
    </motion.div>
  );
}
