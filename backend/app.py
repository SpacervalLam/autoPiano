from flask import Flask, request, jsonify
from flask_cors import CORS
from pathlib import Path

app = Flask(__name__)
CORS(app)

# 数字音符到键盘按键的映射（来自 macro_player.py）
NOTE_TO_KEY = {
    "1": "z", "2": "x", "3": "c", "4": "v", "5": "b", "6": "n", "7": "m",
    "1+": "a", "2+": "s", "3+": "d", "4+": "f", "5+": "g", "6+": "h", "7+": "j",
    "1++": "q", "2++": "w", "3++": "e", "4++": "r", "5++": "t", "6++": "y", "7++": "u",
}

# 键盘按键到前端音符名的映射（来自 frontend/main.js）
KEY_TO_NOTE = {
    'z': 'C3', 'x': 'D3', 'c': 'E3', 'v': 'F3', 'b': 'G3', 'n': 'A3', 'm': 'B3',
    'a': 'C4', 's': 'D4', 'd': 'E4', 'f': 'F4', 'g': 'G4', 'h': 'A4', 'j': 'B4',
    'q': 'C5', 'w': 'D5', 'e': 'E5', 'r': 'F5', 't': 'G5', 'y': 'A5', 'u': 'B5',
}

def parse_notes(note_str, note_map):
    notes = []
    for n in note_str.split(","):
        n = n.strip()
        if not n:
            continue
        if n == "0" or n not in note_map:
            continue
        notes.append(note_map[n])
    return notes

def load_song_txt(path):
    events = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) != 3:
                continue
            at, note_str, duration = parts
            # 先转换数字音符到按键，再转换按键到前端音符名
            key_notes = parse_notes(note_str, NOTE_TO_KEY)
            for key in key_notes:
                if key in KEY_TO_NOTE:
                    events.append({
                        "note": KEY_TO_NOTE[key],
                        "time": float(at) / 1000.0,
                        "duration": float(duration) / 1000.0
                    })
    return events

def list_songs():
    songs_dir = Path(__file__).parent.parent / "songs"
    if not songs_dir.exists():
        return []
    
    songs = []
    for file in sorted(songs_dir.glob("*.txt")):
        songs.append({
            "filename": file.name,
            "name": file.stem
        })
    return songs

@app.route('/api/songs', methods=['GET'])
def get_songs():
    songs = list_songs()
    return jsonify({"songs": songs})

@app.route('/api/songs/<filename>', methods=['DELETE'])
def delete_song(filename):
    songs_dir = Path(__file__).parent.parent / "songs"
    song_path = songs_dir / filename
    
    if not song_path.exists():
        return jsonify({"success": False, "message": "曲目不存在"})
    
    try:
        song_path.unlink()
        return jsonify({"success": True, "message": "删除成功"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    data = request.get_json(silent=True) or {}
    song_name = data.get('song', 'song1.txt')
    
    # 加载指定的歌曲文件
    song_path = Path(__file__).parent.parent / "songs" / song_name
    if not song_path.exists():
        # 如果找不到，尝试第一个可用的
        songs = list_songs()
        if songs:
            song_path = Path(__file__).parent.parent / "songs" / songs[0]["filename"]
    
    if song_path.exists():
        events = load_song_txt(str(song_path))
        return jsonify(events)
    else:
        # 回退到示例
        sample = [
            {"note": "C4", "time": 0.0, "duration": 0.5},
            {"note": "E4", "time": 0.5, "duration": 0.5},
            {"note": "G4", "time": 1.0, "duration": 0.5}
        ]
        return jsonify(sample)

# 前端音符名到数字音符的反向映射
FRONTEND_NOTE_TO_NUMBER = {
    'C3': '1', 'D3': '2', 'E3': '3', 'F3': '4', 'G3': '5', 'A3': '6', 'B3': '7',
    'C4': '1+', 'D4': '2+', 'E4': '3+', 'F4': '4+', 'G4': '5+', 'A4': '6+', 'B4': '7+',
    'C5': '1++', 'D5': '2++', 'E5': '3++', 'F5': '4++', 'G5': '5++', 'A5': '6++', 'B5': '7++',
}

@app.route('/api/record', methods=['POST'])
def record():
    data = request.get_json(silent=True) or {}
    song_name = data.get('song_name', '')
    notes = data.get('notes', [])
    
    if not song_name.strip():
        return jsonify({"success": False, "message": "请输入曲目名称"})
    
    # 创建歌曲目录（如果不存在）
    songs_dir = Path(__file__).parent.parent / "songs"
    songs_dir.mkdir(exist_ok=True)
    
    # 生成文件名
    filename = song_name.strip() + '.txt'
    song_path = songs_dir / filename
    
    # 检查文件是否已存在
    if song_path.exists():
        return jsonify({"success": False, "message": "曲目已存在"})
    
    try:
        # 写入文件头
        content = "# " + song_name + "\n"
        content += "# BPM=125，四四拍\n"
        content += "# 四分音符=480ms，八分=240ms，十六分=120ms\n"
        content += "# 音高标记：无标记 = 低音区（C3-B3），+ = 中音区（C4-B4），++ = 高音区（C5-B5）\n"
        content += "# 格式：起始时间(ms)  音符  时值(ms)\n"
        content += "# =====================================\n\n"
        
        # 写入音符数据
        for note in notes:
            note_name = note.get('note', '')
            time = note.get('time', 0)
            duration = note.get('duration', 0.5)
            
            if note_name in FRONTEND_NOTE_TO_NUMBER:
                num_note = FRONTEND_NOTE_TO_NUMBER[note_name]
                time_ms = int(time * 1000)
                duration_ms = int(duration * 1000)
                content += f"{time_ms:>8}   {num_note:<6} {duration_ms}\n"
        
        # 写入文件
        with open(song_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return jsonify({"success": True, "message": "录制成功"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
