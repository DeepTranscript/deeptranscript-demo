import os
import json
from pprint import pprint
from flask import Flask, request, send_from_directory

app = Flask(__name__)

FILES_DIR = f"{os.path.dirname(__file__)}/../_files"


@app.route('/callback', methods=['POST'])
def webhook_handler():
    print("*** Transcription Callback received ***")
    print("request's headers:", )
    pprint(request.headers)
    fname = request.args.get('fname', 'test')
    print(f"transcription took {request.json.get('transcriptionDuration')}s")
    print(f'see `$ jq . /tmp/{fname}.json` for more information on request\'s body')
    with open(f'/tmp/{fname}.json', "w") as f:
        json.dump(request.json, f)
    return "OK"


@app.route('/files/<filename>', methods=['GET'])
def getfile(filename):
    return send_from_directory(FILES_DIR, filename)


if __name__ == "__main__":
    print(f"start serving local files from {os.path.abspath(FILES_DIR)}")
    app.run(port=5000, debug=True)
