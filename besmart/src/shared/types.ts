export interface StudyPlan {
  id: number;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  is_completed: boolean;
  created_at: string;
}

export interface PlanTask {
  id: number;
  plan_id: number;
  name: string;
  description: string;
  planned_start: string;
  planned_end: string;
  actual_start: string | null;
  actual_end: string | null;
  is_completed: boolean;
}

export interface CheckInSchedule {
  id: number;
  name: string;
  type: 'daily' | 'weekly' | 'monthly' | 'seasonly' | 'yearly';
  score: number;
  is_active: boolean;
}

export interface CheckInTask {
  id: number;
  schedule_id: number;
  schedule_name: string;
  task_date: string;
  is_completed: boolean;
  completed_at: string | null;
  is_timeout: boolean;
  schedule_type: string;
  score: number | null;
}

export interface ReviewCourse {
  id: number;
  name: string;
  description: string;
  studied_date: string;
  is_postponed: boolean;
  created_at: string;
}

export interface ReviewRecord {
  id: number;
  course_id: number;
  course_name: string;
  course_description: string;
  reviewed_times: number;
  planned_date: string;
  is_reviewed: boolean;
  reviewed_date: string | null;
}

export interface Todo {
  id: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  plan_id: number | null;
}

export interface DashboardStats {
  studyplans: {
    active: number;
    completed: number;
    total: number;
  };
  checkins: {
    today_total: number;
    today_completed: number;
    streak: number;
    score_today: number;
  };
  reviews: {
    due_today: number;
    total_courses: number;
  };
  todos: {
    active: number;
    completed: number;
    overdue: number;
    high_priority: number;
  };
}

export interface ScoreRecord {
  id: number;
  score_date: string;
  score: number;
}
