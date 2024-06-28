import os

from dotenv import load_dotenv
from flask import Flask, request, render_template, send_from_directory
import json

load_dotenv()
DEBUG = True if os.getenv('DEBUG') == 'True' else False
SERVICE_META = os.getenv("SERVICE_META")
app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/download')
def download():
    filename = request.args.get('filename', '')
    return send_from_directory("/apps/resource", filename, as_attachment=True)


@app.route('/login')
def login():
    return render_template('login.html', SERVICE_META=json.loads(SERVICE_META))


@app.route('/pay')
def pay():
    ALIPAY_PUB_KEY_PATH=os.path.join(os.getcwd(), 'grocery', 'alipay_pub.txt')
    APP_PRI_KEY_PATH = os.path.join(os.getcwd(), 'grocery', 'app_pri.txt')
    ALIPAY_PUB_KEY=open(ALIPAY_PUB_KEY_PATH).read()
    APP_PRI_KEY=open(APP_PRI_KEY_PATH).read()
    alipay = AliPay(
        appid=os.getenv('appid'),
        app_private_key_string=APP_PRI_KEY,
        alipay_public_key_string=ALIPAY_PUB_KEY,
        app_notify_url=os.getenv('app_notify_url'),
        sign_type=os.getenv('sign_type'),
        debug=DEBUG
    )
    order_string=alipay.api_alipay_trade_page_pay(
        subject='商家收款',
        out_trade_no='202406210628',
        total_amount='0.01',
        return_url='http://localhost:5000/done',
        notify_url='http://localhost:5000/done'
    )
    return 'https://openapi-sandbox.dl.alipaydev.com/gateway.do?'+order_string


@app.route('/done')
def done():
    return 'done!'

PORT = os.getenv('PORT')
NACOS_SERVER_URL = os.getenv('NACOS_SERVER_URL')
SERVICE_NAME = os.getenv('SERVICE_NAME')
SERVICE_IP = os.getenv('SERVICE_IP')

if not DEBUG:
    from py_request_nacos import register_to_nacos
    register_to_nacos(NACOS_SERVER_URL, SERVICE_NAME, SERVICE_IP, PORT)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
