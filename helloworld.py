from flask import Flask
from markupsafe import escape

app = Flask(__name__)

@app.route("/")
def helloworld():
    return "<p>Hello, World!</p>"

@app.route("/<name>")
def greeting(name):
    return f"<p>Hello, {escape(name)}!</p>"