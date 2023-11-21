from dataclasses import dataclass
from flask import Flask, render_template, request, jsonify
from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import desc

import os
from dotenv import load_dotenv

load_dotenv()
SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
db = SQLAlchemy(app)
scheduler = BackgroundScheduler()


class Account(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    accountname = db.Column(db.String(15))
    accountbalance = db.Column(db.Float(8, 2))
    remark = db.Column(db.String(15))


class Item(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    itemname = db.Column(db.String(15))


class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    itemid = db.Column(db.Integer)
    transactiondate = db.Column(db.Date())
    accountid = db.Column(db.Integer)
    account = db.Column(db.Float(8, 2))
    remark = db.Column(db.String(15))


@app.route('/hello_account')
def hello_checkin():
    return 'Hello, Account!'

WELCOME_WORDS=os.getenv('WELCOME_WORDS')
@app.route('/')
def index():
    accounts = Account.query.all()
    return render_template('index.html',  accounts=accounts)


PORT = os.getenv('PORT')
NACOS_SERVER_URL = os.getenv('NACOS_SERVER_URL')
SERVICE_NAME = os.getenv('SERVICE_NAME')
SERVICE_IP = os.getenv('SERVICE_IP')
from py_request_nacos import register_to_nacos
register_to_nacos(NACOS_SERVER_URL, SERVICE_NAME, SERVICE_IP, PORT)
DEBUG = True if os.getenv('DEBUG') == 'True' else False
if __name__ == '__main__':
    #scheduler.add_job(job_function, 'cron', minute=0, hour=2)
    #scheduler.start()
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
