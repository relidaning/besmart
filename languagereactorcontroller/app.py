from flask import Flask, request, render_template
import os
from dotenv import load_dotenv
from pynput.keyboard import Key, Controller

load_dotenv()
PORT = os.getenv('PORT')
DEBUG = True if os.getenv('DEBUG') == 'True' else False
app = Flask(__name__)
keyboard = Controller()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/option')
def option():
    option = request.args.get('o', '')
    print(f'[#] Request /option, and option is: {option}')
    if option!='' and option != 'space':
        keyboard.press(option)
        keyboard.release(option)
    else:
        keyboard.press(Key.space)
        keyboard.release(Key.space)
    return {'code': 200, 'data': 'Button  clicked...'}

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
