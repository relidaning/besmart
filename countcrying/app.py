import logging
from datetime import datetime, timedelta

import matplotlib.pyplot as plt
from flask import Flask, render_template, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
import io
import base64

import os
os.environ['OPENBLAS_NUM_THREADS'] = '1'
from dotenv import load_dotenv

load_dotenv()
SQLALCHEMY_DATABASE_URI=os.getenv('SQLALCHEMY_DATABASE_URI')
DEBUG = True if os.getenv('DEBUG') == 'True' else False

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
db = SQLAlchemy(app)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s: %(message)s')


class cried_record(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    cried_date = db.Column(db.Date())
    ip = db.Column(db.String(120))
    reason = db.Column(db.String(120))


@app.route("/")
def countcrying():
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    app.logger.info('remote user\'s ip address: ' + ip)
    now = datetime.utcnow() + timedelta(hours=8)
    now_date = now.date()
    results = cried_record.query.filter(db.func.DATE(cried_record.cried_date) == now_date).all()
    return render_template('countcrying.html', times=len(results))


@app.route("/add", methods=['POST'])
def add():
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    now = datetime.utcnow() + timedelta(hours=8)
    now_date = now.date()
    record = cried_record(cried_date=now, reason='', ip=ip)
    db.session.add(record)
    db.session.commit()

    results = cried_record.query.filter(db.func.DATE(cried_record.cried_date) == now_date).all()
    return {'data': len(results), 'code': 200, 'message': 'Your IP address is ' + ip + '.'}


@app.route("/stat", methods=['GET'])
def stat():
    sql = text('select DATE_FORMAT(cried_date, "%m-%d"), ' \
               'count(1) ' \
               'from cried_record ' \
               'group by DATE_FORMAT(cried_date, "%m-%d") ' \
               'order by DATE_FORMAT(cried_date, "%m-%d") ')
    results = list(db.session.execute(sql))
    fig, ax = plt.subplots()
    x = [result[0] for result in results]
    y = [result[1] for result in results]
    ax.grid(True)
    ax.set_title('Crying Trend')
    ax.plot(x, y)
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png')
    buffer.seek(0)
    image = buffer.getvalue()
    graph = base64.b64encode(image).decode('utf-8')
    return render_template('stat.html', src=graph)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=DEBUG)
