from flask import Flask, request, render_template, redirect
from pyauthtools.jwtauthtool import auth, encode
from flask_sqlalchemy import SQLAlchemy
import os
from dotenv import load_dotenv

load_dotenv()
DEBUG = True if os.getenv('DEBUG') == 'True' else False
SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
db = SQLAlchemy(app)


class Users(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(255))
    password = db.Column(db.String(255))


@app.route('/')
@auth
def index():
  return render_template('index.html')


@app.route('/login', methods=['POST'])
def login():
  username = request.form.get('username')
  passwd = request.form.get('passwd')
  user = Users.query.filter_by(username=username, password=passwd).first()
  if not user:
    result = 'Unauthorized', 401
    return render_template('login.html', result=result)
  else:
    result = encode({'username': username}), 200
    print(f'login success!, token: {result}')
    return render_template('index.html', result=result)
  
  
PORT = os.getenv('PORT')
NACOS_SERVER_URL = os.getenv('NACOS_SERVER_URL')
SERVICE_NAME = os.getenv('SERVICE_NAME')
SERVICE_IP = os.getenv('SERVICE_IP')

if not DEBUG:
    from py_request_nacos import register_to_nacos
    register_to_nacos(NACOS_SERVER_URL, SERVICE_NAME, SERVICE_IP, PORT)
    

if __name__ == '__main__':
  app.run(host='0.0.0.0', port=PORT, debug=DEBUG)