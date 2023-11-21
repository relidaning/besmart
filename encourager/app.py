from flask import Flask, render_template, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.sql.expression import func

import os
from dotenv import load_dotenv

load_dotenv()
SQLALCHEMY_DATABASE_URI=os.getenv('SQLALCHEMY_DATABASE_URI')
DEBUG = True if os.getenv('DEBUG') == 'True' else False

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
db = SQLAlchemy(app)


class statement_lib(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    statement = db.Column(db.String(120))
    type = db.Column(db.String(2))


@app.route('/hello_encourager')
def hello_encourager():
    return 'Hello, Encourager!'


@app.route('/')
def index():
    type = request.args.get('type', '')
    statement = statement_lib.query.order_by(func.rand()).first()
    if type=='api':
        return {"code": 200, "data": statement.statement, "msg": "success"}
    else:
        return render_template('index.html', statement=statement)


NACOS_SERVER_URL = os.getenv('NACOS_SERVER_URL')
PORT=os.getenv('PORT')
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
scheduler = BackgroundScheduler()
import requests
@scheduler.scheduled_job(trigger=IntervalTrigger(seconds=5))
def service_beat():
    url = NACOS_SERVER_URL + '/v1/ns/instance?serviceName=encourager&ip=82.157.147.8&port='+PORT
    result = requests.post(url)
    print('encourager regist result:', result.text)


if __name__ == '__main__':
    scheduler.start()
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
