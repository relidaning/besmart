from datetime import datetime
from flask import Flask, render_template, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import desc

import os
from dotenv import load_dotenv

load_dotenv()
DEBUG = True if os.getenv('DEBUG') == 'True' else False
SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
db = SQLAlchemy(app)


@app.route('/hello_todos')
def hello_checkin():
    return 'Hello, Todos!'


class catagory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    catagory_name = db.Column(db.String(120))


class todos(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    catagory_id = db.Column(db.Integer)
    catagory_name = db.Column(db.String(120))
    todo_name = db.Column(db.String(120))
    acomplished_time = db.Column(db.Date())
    create_time = db.Column(db.Date())
    is_completed = db.Column(db.String(4))
    postponed = db.Column(db.Integer)


@app.route('/')
def index():
    now = datetime.now()
    now_date = now.date()
    todos_result = todos.query.filter(todos.is_completed == '0').order_by(todos.postponed, desc(todos.id)).all()
    # todos_result = todos.query.order_by(func.rand()).filter(todos.is_completed == '0').limit(4).all()
    dones_today = todos.query.filter(todos.is_completed == '1', db.func.DATE(todos.acomplished_time) == now_date).all()
    return render_template('index.html', todos=todos_result, done_counts=len(dones_today))


@app.route('/todos/add')
def todos_add():
    catagories = catagory.query.filter().all()
    return render_template('todo.html', catagories=catagories, todo=None)


@app.route('/todos/save', methods=['POST'])
def todos_save():
    todoId = request.form.get("todoId")
    todo_name = request.form.get("todoName")
    catagory_id = request.form.get("catagoryId")
    if todoId:
        todo = todos.query.get(todoId)
        todo.todo_name = todo_name
        todo.catagory_id = catagory_id
    else:
        now = datetime.now()
        now_date = now.date()
        new_todo = todos(todo_name=todo_name, catagory_id=catagory_id, create_time=now_date, is_completed='0', postponed='0')
        db.session.add(new_todo)
    db.session.commit()
    return index()

@app.route('/todos/edit/<todoId>')
def todos_edit(todoId):
    todo = todos.query.get(todoId)
    catagories = catagory.query.filter().all()
    return render_template('todo.html', todo=todo, catagories=catagories)


@app.route('/complete/<todoId>', methods=['POST'])
def complete(todoId):
    now = datetime.now()
    todo = todos.query.get(todoId)
    todo.is_completed = '1'
    todo.acomplished_time = now
    db.session.commit()
    return {'code': 200, 'msg': 'success'}


@app.route('/postpone/<todoId>')
def postpone(todoId):
    todo = todos.query.get(todoId)
    todo.postponed = todo.postponed + 1
    db.session.commit()
    return index()


DEBUG = True if os.getenv('DEBUG') == 'True' else False
NACOS_SERVER_URL = os.getenv('NACOS_SERVER_URL')
SERVICE_NAME = os.getenv('SERVICE_NAME')
SERVICE_IP = os.getenv('SERVICE_IP')
PORT = os.getenv('PORT')

if not DEBUG:
    from py_request_nacos import register_to_nacos
    register_to_nacos(NACOS_SERVER_URL, SERVICE_NAME, SERVICE_IP, PORT)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
