#
# This is a db module, and data class
# 
from dataclasses import dataclass
from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from app import app


SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
db = SQLAlchemy(app)

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer)
    task_name = db.Column(db.String(119))
    task_date = db.Column(db.Date())
    is_completed = db.Column(db.String(1))
    complete_time = db.Column(db.Date())
    is_timeout = db.Column(db.String(1))
    schedule_type = db.Column(db.String(1))

class Schedule(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    schedule_name = db.Column(db.String(120))
    schedule_type = db.Column(db.String(2))
    score = db.Column(db.Float)
    is_valid = db.Column(db.String(2))

@dataclass
class Score(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    score_date: str = db.Column(db.Date())
    score: float = db.Column(db.Float)



