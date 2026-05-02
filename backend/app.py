from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)


@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    # 占位实现：忽略上载文件，返回示例 MIDI JSON
    sample = [
        {"note": "C4", "time": 0.0, "duration": 0.5},
        {"note": "E4", "time": 0.5, "duration": 0.5},
        {"note": "G4", "time": 1.0, "duration": 0.5}
    ]
    return jsonify(sample)


if __name__ == '__main__':
    app.run(debug=True, port=5000)
