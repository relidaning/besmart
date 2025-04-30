from dataclasses import dataclass
from flask import Flask, render_template, request, jsonify
from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import desc

import os
from os.path import join, dirname
from dotenv import load_dotenv

app = Flask(__name__)
cur_config = os.environ.get('FLASK_ENV', 'dev')
env_file=join(dirname(__file__), f'.env.{cur_config}')
load_dotenv(env_file)
DEBUG = True if os.getenv('DEBUG') == 'True' else False
SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
db = SQLAlchemy(app)
scheduler = BackgroundScheduler()


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer)
    task_name = db.Column(db.String(119))
    task_date = db.Column(db.Date())
    is_completed = db.Column(db.String(1))
    complete_time = db.Column(db.Date())
    is_timeout = db.Column(db.String(1))
    schedule_type = db.Column(db.String(1))


class Schedule(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    schedule_name = db.Column(db.String(120))
    schedule_type = db.Column(db.String(2))
    score = db.Column(db.Float)
    is_valid = db.Column(db.String(2))


@dataclass
class Score(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    score_date: str = db.Column(db.Date())
    score: float = db.Column(db.Float)


@app.route('/hello_checkin')
def hello_checkin():
    return 'Hello, Checkin!'


@app.route('/')
def index():
    # current date
    now = datetime.now()
    now_date = now.date()
    if now.time().hour < 6:
        now_date = now_date - timedelta(days=1)
        
    # all tasks    
    tasks = []
    daily = Task.query.filter(db.func.DATE(Task.task_date) == now_date, Task.schedule_type == '1', Task.is_completed == '0').all()
    weekly = Task.query.filter(Task.is_completed == '0', Task.schedule_type == '2').all()
    monthly = Task.query.filter(Task.is_completed == '0', Task.schedule_type == '3').all()
    seasonly = Task.query.filter(Task.is_completed == '0', Task.schedule_type == '4').all()
    yearly = Task.query.filter(Task.is_completed == '0', Task.schedule_type == '5').all()
    tasks.extend(daily)
    tasks.extend(weekly)
    tasks.extend(monthly)
    tasks.extend(seasonly)
    tasks.extend(yearly)

    # format tasks
    fat_tasks = []
    for t in tasks:
        fat_t = {}
        schedule = Schedule.query.get(t.task_id)
        fat_t['id'] = t.id
        fat_t['task_id'] = schedule.id
        fat_t['task_name'] = schedule.schedule_name
        fat_t['task_date'] = t.task_date
        fat_t['is_completed'] = t.is_completed
        fat_t['complete_time'] = t.complete_time
        fat_t['is_timeout'] = t.is_timeout
        fat_t['schedule_type'] = t.schedule_type
        if schedule.score:
            fat_t['score'] = schedule.score
            fat_t['total']  = Task.query.filter(Task.is_completed == '1', Task.task_id == t.task_id, Task.schedule_type=='1').count()
        fat_tasks.append(fat_t)
        
    # sort tasks by task_date
    fat_tasks.sort(key=lambda x: x['task_date'], reverse=False)

    return render_template('index.html', tasks=fat_tasks)


@app.route('/complete/<taskId>', methods=['POST'])
def complete(taskId):
    now = datetime.now()
    task = Task.query.get(taskId)
    task.is_completed = '1'
    task.complete_time = now
    db.session.commit()
    return {'code': 200, 'msg': 'success'}


@app.route('/schedule/<schedule_id>', methods=['GET'])
def schedule(schedule_id):
    if schedule_id:
        schedule = Schedule.query.get(schedule_id)
    return render_template('schedule.html', schedule=schedule)


@app.route('/schedule/save', methods=['POST'])
def schedule_save():
    id = request.form.get("id")
    schedule_name = request.form.get("scheduleName")
    schedule_type = request.form.get("scheduleType")
    score = request.form.get("score")
    if not id:
        schedule = Schedule(schedule_name=schedule_name, schedule_type=schedule_type, score=score, is_valid='1')
        db.session.add(schedule)
    else:
        schedule0 = Schedule.query.get(id)
        schedule0.is_valid = '0'
        schedule1 = Schedule(schedule_name=schedule_name, schedule_type=schedule_type, score=score, is_valid='1')
        db.session.add(schedule1)
    db.session.commit()
    return index()


@app.route('/scores')
def scores():
    start = request.args.get('start')
    end = request.args.get('end')
    all_valid_score = Score.query.filter(Score.score_date >= start, Score.score_date <= end).order_by(
        desc(Score.score_date)).all()
    return jsonify(all_valid_score)


def job_function():
    now_date = datetime.now().date()
    with app.app_context():
        db.session.begin()
        # generate daily task
        dailies = Schedule.query.filter(Schedule.schedule_type == '1', Schedule.is_valid=='1').all()
        for daily in dailies:
            new_daily = Task(task_id=daily.id, task_name=daily.schedule_name, task_date=now_date,
                             is_completed='0', schedule_type='1')
            db.session.add(new_daily)
        # handle expired daily task
        yesterday = now_date - timedelta(days=1)
        undoned_daily_tasts = Task.query.filter(db.func.DATE(Task.task_date) == yesterday,
                                                Task.is_completed == '0', Task.schedule_type == '1').all()
        score = Score(score_date=yesterday)
        score_of_yesterday = 100
        for task in undoned_daily_tasts:
            score_of_schedule = Schedule.query.get(task.task_id).score
            task.is_timeout = '1'
            score_of_yesterday -= score_of_schedule
        score.score = score_of_yesterday
        db.session.add(score)

        # generate weekly task
        if now_date.weekday() == 5:
            weeklies = Schedule.query.filter(Schedule.schedule_type == '2').all()
            for weekly in weeklies:
                task = Task(task_id=weekly.id, task_name=weekly.schedule_name, task_date=now_date,
                            is_completed='0', schedule_type='2')
                db.session.add(task)
        # handle expired weekly task
        # if now_date.weekday() == '0':
        #     the_day_before_yesterday = yesterday - timedelta(days=1)
        #     undoned_weekly_tasts = Task.query.filter(db.func.DATE(Task.task_date) == the_day_before_yesterday,
        #                                              Task.is_completed == '0', Task.schedule_type == '2').all()
        #     for task in undoned_weekly_tasts:
        #         task.is_timeout = '1'

        # generate monthly task
        if now_date.day == 1:
            monthlies = Schedule.query.filter(Schedule.schedule_type == '3').all()
            for monthly in monthlies:
                task = Task(task_id=monthly.id, task_name=monthly.schedule_name, task_date=now_date,
                            is_completed='0', schedule_type='3')
                db.session.add(task)

        # generate seasonly task
        if now_date.day == 1 and (
                now_date.month == 4 or now_date.month == 7 or now_date.month == 10 or now_date.month == 1):
            seasonlies = Schedule.query.filter(Schedule.schedule_type == '4').all()
            for seasonly in seasonlies:
                task = Task(task_id=seasonly.id, task_name=seasonly.schedule_name, task_date=now_date,
                            is_completed='0', schedule_type='4')
                db.session.add(task)

        # generate yearly task
        if now_date.day == 1 and now_date.month == 1:
            yearlies = Schedule.query.filter(Schedule.schedule_type == '5').all()
            for yearly in yearlies:
                task = Task(task_id=yearly.id, task_name=yearly.schedule_name, task_date=now_date,
                            is_completed='0', schedule_type='5')
                db.session.add(task)

        # commit
        db.session.commit()


PORT = os.getenv('PORT')
NACOS_SERVER_URL = os.getenv('NACOS_SERVER_URL')
SERVICE_NAME = os.getenv('SERVICE_NAME')
SERVICE_IP = os.getenv('SERVICE_IP')

if not DEBUG:
    from py_request_nacos import register_to_nacos
    register_to_nacos(NACOS_SERVER_URL, SERVICE_NAME, SERVICE_IP, PORT)

if __name__ == '__main__':
    scheduler.add_job(job_function, 'cron', minute=0, hour=6)
    scheduler.start()
    # app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
    app.run(host='::', port=PORT, debug=DEBUG)