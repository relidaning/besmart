import os

from dotenv import load_dotenv
from flask import Flask, render_template, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.sql.expression import func

load_dotenv()
SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
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
    if type == 'api':
        return {"code": 200, "data": statement.statement, "msg": "success"}
    else:
        return render_template('index.html', statement=statement)


NACOS_SERVER_URL = os.getenv('NACOS_SERVER_URL')
SERVICE_NAME = os.getenv('SERVICE_NAME')
SERVICE_IP = os.getenv('SERVICE_IP')
PORT = os.getenv('PORT')

if not DEBUG:
    from py_request_nacos import register_to_nacos
    register_to_nacos(NACOS_SERVER_URL, SERVICE_NAME, SERVICE_IP, PORT)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
