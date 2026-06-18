from dataclasses import dataclass
from flask import Flask, render_template, request, jsonify
from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import desc
from kazoo.client import KazooClient

import os
from dotenv import load_dotenv

load_dotenv()
DEBUG = True if os.getenv('DEBUG') == 'True' else False
SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
db = SQLAlchemy(app)
ZK_SERVER = os.getenv('ZK_SERVER')
zk = KazooClient(hosts=ZK_SERVER)
CLOUDY_ROOT = os.getenv('CLOUDY_ROOT')
CURRENT_PATH = '/'


@app.route('/')
def index():
    nodes = zk.get_children(CLOUDY_ROOT)
    return render_template('index.html', nodes=nodes)


@app.route('/create_node/<node>', methods=['POST'])
def create_node(node):
    tmp_path = CLOUDY_ROOT + '/' + node
    try:
        result = zk.create(tmp_path)
        print(f'[]result: {result}')
        if result == tmp_path:
            return index()
    except:
        return {'code': 500, 'msg': 'Node Exists!'}


@app.route('/change_node/<node>', methods=['POST'])
def change_node(node, current_path=None):
    current_path += node
    return index(current_path)


PORT = os.getenv('PORT')
NACOS_SERVER_URL = os.getenv('NACOS_SERVER_URL')
SERVICE_NAME = os.getenv('SERVICE_NAME')
SERVICE_IP = os.getenv('SERVICE_IP')

if not DEBUG:
    from py_request_nacos import register_to_nacos
    register_to_nacos(NACOS_SERVER_URL, SERVICE_NAME, SERVICE_IP, PORT)

if __name__ == '__main__':
    zk.start()
    app.run(host='::', port=PORT, debug=DEBUG)
