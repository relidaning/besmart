import os

from dotenv import load_dotenv
from flask import Flask, request, render_template, send_from_directory, send_file
from flask_sqlalchemy import SQLAlchemy
import json
from werkzeug.utils import secure_filename

load_dotenv()
DEBUG = True if os.getenv('DEBUG') == 'True' else False
SERVICE_META = os.getenv("SERVICE_META")
SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
app.config['UPLOAD_FOLDER'] = os.getenv('UPLOAD_FOLDER')
db = SQLAlchemy(app)


class Doc(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    doc_name = db.Column(db.String(119))
    doc_path = db.Column(db.String(119))


@app.route('/')
def index():
    docs = Doc.query.all()
    return render_template('index.html', docs=docs)


@app.route('/addDoc')
def add_doc():
    return render_template('addDoc.html')


@app.route('/upload', methods=['POST'])
def upload():
    file = request.files['docFile']
    doc_name = file.filename
    doc_path = secure_filename(file.filename)
    file.save(os.path.join(app.config['UPLOAD_FOLDER'], doc_path))
    doc = Doc(doc_name=doc_name, doc_path=doc_path)
    db.session.add(doc)
    db.session.commit()
    return index()


@app.route('/download')
def download():
    doc_path = request.args.get('doc_path', '')
    doc_name = request.args.get('doc_name', '')
    #return send_from_directory(app.config['UPLOAD_FOLDER'], filename, as_attachment=True)
    return send_file(path_or_file=app.config['UPLOAD_FOLDER']+'/'+doc_path, as_attachment=True, download_name=doc_name)


@app.route('/login')
def login():
    return render_template('login.html', SERVICE_META=json.loads(SERVICE_META))


PORT = os.getenv('PORT')
NACOS_SERVER_URL = os.getenv('NACOS_SERVER_URL')
SERVICE_NAME = os.getenv('SERVICE_NAME')
SERVICE_IP = os.getenv('SERVICE_IP')

if not DEBUG:
    from py_request_nacos import register_to_nacos
    register_to_nacos(NACOS_SERVER_URL, SERVICE_NAME, SERVICE_IP, PORT)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
