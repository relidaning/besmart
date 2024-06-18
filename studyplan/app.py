from datetime import datetime
from flask import Flask, render_template, jsonify, request
import requests
from flask_sqlalchemy import SQLAlchemy
from babel.dates import format_datetime
import json
import os
from dotenv import load_dotenv

load_dotenv()
DEBUG = True if os.getenv('DEBUG') == 'True' else False
SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
SCORE_URI = os.getenv('SCORE_URI')

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
db = SQLAlchemy(app)


class Plan(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    plan_name = db.Column(db.String(120))
    explanation = db.Column(db.String(120))
    start_date = db.Column(db.Date())
    end_date = db.Column(db.Date())
    is_completed = db.Column(db.String(2))
    is_timeout = db.Column(db.String(2))


@app.route('/hello_studyplan')
def hello_checkin():
    return 'Hello, StudyPlan!'


@app.route('/')
def index():
    plan = Plan.query.order_by(Plan.id.desc()).first()
    result = requests.get(SCORE_URI, params={'start': plan.start_date, 'end': plan.end_date}).text
    scores = json.loads(result)
    GMT_FORMAT = '%a, %d %b %Y %H:%M:%S GMT'
    for score in scores:
        date_string = score['score_date']
        score['score_date'] = datetime.strftime(datetime.strptime(date_string, GMT_FORMAT), '%Y-%m-%d')
    days = 0
    total_score = 0
    for score in scores:
        total_score += score['score']
        days += 1
    average = 0 if days == 0 else round(total_score / days, 2)
    return render_template('index.html', plan=plan, scores=scores, average=average)


@app.route('/add')
def add():
    return render_template('studyplan.html')


@app.route('/save', methods=['POST'])
def save():
    plan_name = request.form.get("planName")
    start_date = request.form.get("startDate")
    end_date = request.form.get("endDate")
    explanation = request.form.get("explanation")
    plan = Plan(plan_name=plan_name, start_date=start_date, end_date=end_date, explanation=explanation, is_completed='0', is_timeout='0')
    db.session.add(plan)
    db.session.commit()
    return index()


@app.route('/his')
def his():
    return render_template('his.html')


@app.template_filter()
def date_format(value, format='yyyy-MM-dd'):
    return format_datetime(value, format)


PORT = os.getenv('PORT')
NACOS_SERVER_URL = os.getenv('NACOS_SERVER_URL')
SERVICE_NAME = os.getenv('SERVICE_NAME')
SERVICE_IP = os.getenv('SERVICE_IP')

if not DEBUG:
    from py_request_nacos import register_to_nacos
    register_to_nacos(NACOS_SERVER_URL, SERVICE_NAME, SERVICE_IP, PORT)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
