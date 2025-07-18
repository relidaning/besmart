import os
from datetime import date, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from flask import Flask, render_template, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text

load_dotenv()
SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
DEBUG = True if os.getenv('DEBUG') == 'True' else False

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
db = SQLAlchemy(app)
scheduler = BackgroundScheduler()


@app.route('/hello_review')
def hello_checkin():
    return 'Hello, Review!'


class Course(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    course_name = db.Column(db.String(120))
    course_desc = db.Column(db.String(300))
    studied_date = db.Column(db.Date())
    is_postponed = db.Column(db.String(2))


class Record(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer)
    is_reviewed = db.Column(db.String(2))
    reviewed_times = db.Column(db.Integer)
    reviewed_date = db.Column(db.Date())
    planed_date = db.Column(db.Date())


@app.route('/')
def index():
    sql = text("""
            select t1.id, t1.course_id, t2.course_name, t2.is_postponed,
            t2.course_desc, t1.reviewed_times, t1.planed_date from record t1 
            right join ( 
            select course_id, max(reviewed_times) reviewed_times from record 
            group by course_id ) t0 
            on t0.course_id = t1.course_id and t0.reviewed_times = t1.reviewed_times 
            left join course t2 
            on t2.id = t1.course_id 
            where t1.is_reviewed = '0' 
             and t1.planed_date <= now() 
            order by t2.is_postponed, t1.planed_date 
            """)
    results = db.session.execute(sql)
    records=[]
    for r in results:
        record = {}
        record['id']=r[0]
        record['course_id'] = r[1]
        record['course_name'] = r[2]
        record['is_postponed'] = r[3]
        record['course_desc'] = r[4]
        record['reviewed_times'] = r[5]
        record['planed_date'] = r[6]
        records.append(record)
    return render_template('index.html', records=records)


@app.route('/course/edit/<_id>')
def course_edit(_id):
    course = Course.query.get(_id)
    # records = db.session.query(Record.course_id == course.id).order_by(Record.reviewed_date).all()
    # for r in records:
    #     course['studied_his'] = course['studied_his'] + r.reviewed_date
    return render_template('course.html', course=course)


@app.route('/course/save/<_id>', methods=['POST'])
def course_save(_id):
    course_name = request.form.get("courseName")
    course_desc = request.form.get("courseDesc")
    is_postponed = request.form.get("isPostponed")
    today = date.today()

    if _id is None or _id == 'None':
        course = Course(
            course_name=course_name,
            course_desc=course_desc,
            studied_date=today,
            is_postponed=is_postponed
        )
        db.session.add(course)
    else:
        course = Course.query.get(_id)
        course.course_name = course_name
        course.course_desc = course_desc
        course.is_postponed = is_postponed
    db.session.commit()

    return index()


@app.route('/course/del/<_id>')
def course_del(_id):
    course = Course.query.get(_id)
    db.session.delete(course)
    records = Record.query.filter(Record.course_id == _id).all()
    for r in records:
        db.session.delete(r)
    db.session.commit()
    return index()


@app.route('/record/update', methods=['PUT'])
def record_update():
    id = request.form.get("id")
    record = Record.query.get(id)
    record.is_reviewed = '1'
    record.reviewed_date = date.today()
    db.session.commit()
    return {'code': 200, 'msg': 'success'}


def job_function():
    print('job start...')
    with app.app_context():
        db.session.begin()

        sql = text('select record.* from ( '
                   'select course_id, max(reviewed_times) reviewed_times from record '
                   'group by record.course_id ) t0 '
                   'left join record on record.course_id = t0.course_id and record.reviewed_times = t0.reviewed_times')
        results = list(db.session.execute(sql))
        #id, course_id, is_reviewed, reviewed_times, planed_date, reviewed_date
        for r in results:
            if r[2] == '1' and SCHEDULED[r.reviewed_times + 1]:
                new_record = Record(
                    course_id=r[1],
                    planed_date=r[5] + timedelta(days=SCHEDULED[r[3] + 1]),
                    is_reviewed='0',
                    reviewed_times=r[3] + 1
                )
                db.session.add(new_record)

        # commit
        db.session.commit()


NACOS_SERVER_URL = os.getenv('NACOS_SERVER_URL')
SERVICE_NAME = os.getenv('SERVICE_NAME')
SERVICE_IP = os.getenv('SERVICE_IP')
PORT = os.getenv('PORT')
SCHEDULED = [1, 3, 7, 15, 30, 60, 120, 240]

# if not DEBUG:
#     from py_request_nacos import register_to_nacos
#     register_to_nacos(NACOS_SERVER_URL, SERVICE_NAME, SERVICE_IP, PORT)

if __name__ == '__main__':
    scheduler.add_job(job_function, 'cron', minute=0, hour=6)
    scheduler.start()
    app.run(host='0.0.0.0', port=5080, debug=DEBUG)
