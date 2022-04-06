import json
from flask import Flask, request, send_from_directory

app = Flask(__name__)


@app.route('/callback', methods=['POST'])
def webhook_handler():
    print("*** Transcription Callback received ***")
    print("request's headers:", request.headers)
    print("request's body:", request.json)
    fname = request.args.get('fname', 'test')
    print('fname', fname)
    with open(f'/tmp/{fname}.json', "w") as f:
        json.dump(request.json, f)
    return "OK"


@app.route('/files/<filename>', methods=['GET'])
def getfile(filename):
    return send_from_directory('../files', filename)


if __name__ == "__main__":
    app.run(port=5000, debug=True)
