from flask import Flask, request, jsonify, render_template


app = Flask(__name__)

@app.route('/', methods=['GET'])
def index():
  return render_template('index.html')

if __name__ == '__main__':
  app.run(debug=True, host='0.0.0.0', port=5082)