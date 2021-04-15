from flask import Flask, render_template, request
from werkzeug.utils import secure_filename
app = Flask(__name__)


@app.route('/u')
def u():
    return render_template('u.html')


@app.route('/')
@app.route('/index.html')
def hello_world():
    return render_template('index.html')


@app.route('/upload.html', methods=['GET', 'POST'])
def upload():
    if 'file' not in request.files:
        return "no file\n"
    file = request.files['file']
    filename = secure_filename(file.filename)
    print(filename)
    return "upload\n"


@app.route('/name.html', methods=['GET', 'POST'])
def name():
    return "name\n"


app.run('0.0.0.0', debug=True)
