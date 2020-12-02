from flask import Flask,render_template
app = Flask(__name__)

@app.route('/')
def hello_world():
    return render_template('index.html')

@app.route('/upload.html',methods=['GET', 'POST'])
def upload():
    return "upload"


@app.route('/name.html',methods=['GET', 'POST'])
def name():
    return "name"