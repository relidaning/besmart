from flask import Flask, request
from utils.jwtutil import create_jwt
from flask_sqlalchemy import SQLAlchemy
import os
from dotenv import load_dotenv


load_dotenv()
DEBUG = True if os.getenv('DEBUG') == 'True' else False
SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
JWT_SECRET = os.getenv('JWT_SECRET')
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
db = SQLAlchemy(app)


class Users(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(255))
    password = db.Column(db.String(255))
    

@app.route('/login', methods=['POST'])
def login():
  username = request.form.get('username')
  passwd = request.form.get('passwd')
  user = Users.query.filter_by(username=username, password=passwd).first()
  if not user:
    return 'Unauthorized', 401
  
  token = create_jwt(username, JWT_SECRET)
  return token, 200


PORT = os.getenv('PORT')
NACOS_SERVER_URL = os.getenv('NACOS_SERVER_URL')
SERVICE_NAME = os.getenv('SERVICE_NAME')
SERVICE_IP = os.getenv('SERVICE_IP')

if not DEBUG:
    from py_request_nacos import register_to_nacos
    register_to_nacos(NACOS_SERVER_URL, SERVICE_NAME, SERVICE_IP, PORT)
    

if __name__ == '__main__':
  app.run(host='0.0.0.0', port=PORT, debug=DEBUG)