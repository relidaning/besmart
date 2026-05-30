#!/usr/bin/env python3
"""Migrate MySQL dump (mysql.sql.gz) to besmart SQLite database."""

import gzip
import re
import sqlite3

import os
DUMP = os.environ.get('DUMP', '/home/shake/Downloads/mysql.sql.gz')
DB = os.environ.get('DB', '/data/apps/besmart/data/besmart/besmart.db')

TYPE_MAP = {
    '1': 'daily', '2': 'weekly', '3': 'monthly',
    '4': 'seasonly', '5': 'yearly'
}


def parse_row(line):
    line = line.rstrip()
    if line.endswith(');'):
        line = line[:-2]
    elif line.endswith('),'):
        line = line[:-2]
    elif line.endswith(')'):
        line = line[:-1]
    if line.startswith('('):
        line = line[1:]

    parts = line.split('\t')
    result = []
    for part in parts:
        part = part.rstrip(',')
        if part == 'NULL':
            result.append(None)
        elif part == "''":
            result.append('')
        elif len(part) >= 2 and part[0] == "'" and part[-1] == "'":
            val = part[1:-1]
            val = (val.replace("\\'", "'")
                      .replace('\\\\', '\\')
                      .replace('\\n', '\n')
                      .replace('\\r', '\r'))
            result.append(val)
        else:
            try:
                result.append(int(part))
            except ValueError:
                try:
                    result.append(float(part))
                except ValueError:
                    result.append(part)
    return result


def to_int(v):
    if v is None or v == '':
        return 0
    try:
        return int(v)
    except Exception:
        return 0


def read_dump():
    tables = {}
    current_table = None
    with gzip.open(DUMP, 'rt', encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
            m = re.match(r"INSERT INTO `(\w+)`", line)
            if m:
                current_table = m.group(1)
                tables[current_table] = []
            elif current_table and line.startswith('('):
                tables[current_table].append(parse_row(line))
    return tables


def migrate():
    tables = read_dump()

    conn = sqlite3.connect(DB)
    conn.execute('PRAGMA foreign_keys = OFF')
    conn.execute('PRAGMA journal_mode = WAL')

    for tbl in ['checkin_tasks', 'checkin_schedules', 'scores',
                'review_records', 'review_courses',
                'plan_tasks', 'study_plans', 'todos']:
        conn.execute(f'DELETE FROM {tbl}')
        conn.execute(f"DELETE FROM sqlite_sequence WHERE name = ?", (tbl,))

    # checkin_schedules ← schedule (id, schedule_name, schedule_type, score, is_valid)
    for row in tables.get('schedule', []):
        id_, name, stype, score, is_valid = row
        conn.execute(
            'INSERT INTO checkin_schedules (id, name, type, score, is_active) VALUES (?,?,?,?,?)',
            (id_, name, TYPE_MAP.get(str(stype), 'daily'), score, to_int(is_valid))
        )

    # scores ← score (id, score_date, score) — score_date is UNIQUE, use REPLACE for dupes
    for row in tables.get('score', []):
        id_, score_date, score = row
        conn.execute(
            'INSERT OR REPLACE INTO scores (id, score_date, score) VALUES (?,?,?)',
            (id_, score_date, score)
        )

    # checkin_tasks ← task (id, task_id, task_name, task_date, is_completed, complete_time, is_timeout, schedule_type)
    for row in tables.get('task', []):
        id_, task_id, task_name, task_date, is_completed, complete_time, is_timeout, schedule_type = row
        conn.execute(
            'INSERT INTO checkin_tasks (id, schedule_id, schedule_name, task_date, is_completed, completed_at, is_timeout, schedule_type) '
            'VALUES (?,?,?,?,?,?,?,?)',
            (id_, task_id, task_name, task_date,
             to_int(is_completed), complete_time,
             to_int(is_timeout), TYPE_MAP.get(str(schedule_type), 'daily'))
        )

    # review_courses ← course (id, course_name, course_desc, studied_date, is_postponed)
    for row in tables.get('course', []):
        id_, name, desc, studied_date, is_postponed = row
        conn.execute(
            'INSERT INTO review_courses (id, name, description, studied_date, is_postponed) VALUES (?,?,?,?,?)',
            (id_, name, desc or '', studied_date, to_int(is_postponed))
        )

    # review_records ← record (id, course_id, is_reviewed, reviewed_times, planed_date, reviewed_date)
    for row in tables.get('record', []):
        id_, course_id, is_reviewed, reviewed_times, planed_date, reviewed_date = row
        conn.execute(
            'INSERT INTO review_records (id, course_id, is_reviewed, reviewed_times, planned_date, reviewed_date) '
            'VALUES (?,?,?,?,?,?)',
            (id_, course_id, to_int(is_reviewed), reviewed_times, planed_date, reviewed_date)
        )

    # study_plans ← plan (id, plan_name, explanation, start_date, end_date, is_completed, is_timeout)
    for row in tables.get('plan', []):
        id_, name, desc, start_date, end_date, is_completed, _is_timeout = row
        conn.execute(
            'INSERT INTO study_plans (id, name, description, start_date, end_date, is_completed) VALUES (?,?,?,?,?,?)',
            (id_, name, desc or '', start_date, end_date, to_int(is_completed))
        )

    # todos ← todos (id, user_id, catagory_id, catagory_name, todo_name, acomplished_time, create_time, is_completed, postponed)
    for row in tables.get('todos', []):
        id_, _uid, _cid, _cname, title, completed_at, created_at, is_completed, _postponed = row
        conn.execute(
            'INSERT INTO todos (id, title, description, priority, completed, completed_at, created_at) '
            'VALUES (?,?,?,?,?,?,?)',
            (id_, title, '', 'medium', to_int(is_completed), completed_at, created_at)
        )

    # Sync sqlite_sequence so AUTOINCREMENT picks up from the right place
    for tbl in ['checkin_schedules', 'checkin_tasks', 'scores',
                'review_courses', 'review_records', 'study_plans', 'todos']:
        row = conn.execute(f'SELECT MAX(id) FROM {tbl}').fetchone()
        max_id = row[0] if row and row[0] is not None else 0
        if max_id:
            conn.execute(
                'INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, ?)',
                (tbl, max_id)
            )

    conn.execute('PRAGMA foreign_keys = ON')
    conn.commit()
    conn.close()

    print("Migration complete!")
    for t, rows in tables.items():
        print(f"  {t}: {len(rows)} rows imported")


if __name__ == '__main__':
    migrate()
