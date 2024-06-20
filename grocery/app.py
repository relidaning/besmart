import os

from dotenv import load_dotenv
from flask import Flask, render_template

load_dotenv()
DEBUG = True if os.getenv('DEBUG') == 'True' else False
app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')


PORT = os.getenv('PORT')
NACOS_SERVER_URL = os.getenv('NACOS_SERVER_URL')
SERVICE_NAME = os.getenv('SERVICE_NAME')
SERVICE_IP = os.getenv('SERVICE_IP')

if not DEBUG:
    from py_request_nacos import register_to_nacos
    register_to_nacos(NACOS_SERVER_URL, SERVICE_NAME, SERVICE_IP, PORT)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
