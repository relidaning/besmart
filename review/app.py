from datetime import datetime, date, timedelta
from flask import Flask, render_template, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import desc
from apscheduler.schedulers.background import BackgroundScheduler
from enum import Enum

import os
from dotenv import load_dotenv

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


class Review(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    study_id = db.Column(db.Integer)
    study_name = db.Column(db.String(120))
    review_name = db.Column(db.String(120))
    review_date = db.Column(db.Date())
    is_reviewed = db.Column(db.String(4))
    learned_date = db.Column(db.Date())
    reviewed_times = db.Column(db.Integer)


@app.route('/')
def index():
    reviews = Review.query.filter(db.func.DATE(Review.review_date) <= date.today(), Review.is_reviewed == '0').\
        order_by(Review.review_date).all()
    for r in reviews:
        r.review_date = r.review_date.date()
    return render_template('index.html', reviews=reviews)


@app.route('/review/add')
def review_add():
    return render_template('add.html')


@app.route('/review/insert', methods=['POST'])
def review_insert():
    review_name = request.form.get("reviewName")
    today = date.today()
    review_date = today + timedelta(days=1)
    review = Review(review_name=review_name, review_date=review_date, is_reviewed='0', reviewed_times=0)
    db.session.add(review)
    db.session.commit()
    return index()


@app.route('/review/update', methods=['PUT'])
def review_update():
    id = request.form.get("id")
    review = Review.query.get(id)
    review.is_reviewed = '1'
    review.learned_date = date.today()
    db.session.commit()
    return {'code': 200, 'msg': 'success'}


def job_function():
    yesterday = date.today() + timedelta(days=-1)
    with app.app_context():
        db.session.begin()

        reviews = Review.query.filter(db.func.DATE(Review.learned_date) == yesterday, Review.is_reviewed == '1').all()
        for r in reviews:
            new_review = Review(review_name=r.review_name, review_date=r.learned_date+timedelta(days=SCHEDULED[r.reviewed_times+1]),
                                is_reviewed='0', reviewed_times=r.reviewed_times+1)
            db.session.add(new_review)

        # commit
        db.session.commit()


NACOS_SERVER_URL = os.getenv('NACOS_SERVER_URL')
SERVICE_NAME = os.getenv('SERVICE_NAME')
SERVICE_IP = os.getenv('SERVICE_IP')
PORT = os.getenv('PORT')
SCHEDULED=[1,3,7,15,30,60,120,240]
from py_request_nacos import register_to_nacos
# register_to_nacos(NACOS_SERVER_URL, SERVICE_NAME, SERVICE_IP, PORT)
if __name__ == '__main__':
    scheduler.add_job(job_function, 'cron', minute=0, hour=2)
    scheduler.start()
    app.run(host='0.0.0.0', port=5080, debug=DEBUG)
