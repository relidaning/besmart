from dataclasses import dataclass
from flask import Flask, render_template, request, jsonify
from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import desc

import os
from dotenv import load_dotenv

load_dotenv()
DEBUG = True if os.getenv('DEBUG') == 'True' else False
SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
db = SQLAlchemy(app)
scheduler = BackgroundScheduler()


class Study_duration(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    duration = db.Column(db.String(8))


@app.route('/hello_timer')
def hello_checkin():
    return 'Hello, Checkin!'


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/complete/<taskId>', methods=['POST'])
def complete(taskId):
    now = datetime.now()
    task = Task.query.get(taskId)
    task.is_completed = '1'
    task.complete_time = now
    db.session.commit()
    return {'code': 200, 'msg': 'success'}


@app.route('/schedule/add')
def schedule_add():
    return render_template('schedule.html')


@app.route('/schedule/save', methods=['POST'])
def schedule_save():
    schedule_name = request.form.get("scheduleName")
    schedule_type = request.form.get("scheduleType")
    schedule = Schedule(schedule_name=schedule_name, schedule_type=schedule_type)
    db.session.add(schedule)
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
    scheduler.add_job(job_function, 'cron', minute=0, hour=2)
    scheduler.start()
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
