from datetime import datetime
from flask import Flask, render_template, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import desc

import os
from dotenv import load_dotenv

load_dotenv()
SQLALCHEMY_DATABASE_URI=os.getenv('SQLALCHEMY_DATABASE_URI')
DEBUG = True if os.getenv('DEBUG') == 'True' else False

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
db = SQLAlchemy(app)


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


@app.route('/')
def index():
    now = datetime.now()
    now_date = now.date()
    reviews = Review.query.filter(db.func.DATE(Review.review_date) == now_date, Review.is_reviewed=='0').all()
    return render_template('index.html', reviews=reviews)


@app.route('/review/save', methods=['POST'])
def review_save():
    id = request.form.get("id")
    print(id)
    review = Review.query.get(id)
    print(review)
    review.is_reviewed = '1'
    db.session.commit()
    return {'code': 200, 'msg': 'success'}

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5080, debug=DEBUG)