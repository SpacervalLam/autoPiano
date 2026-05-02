import json
import time
import ctypes
import sys
import os
from pathlib import Path
from ctypes import wintypes

SendInput = ctypes.windll.user32.SendInput
keybd_event = ctypes.windll.user32.keybd_event
PostMessageW = ctypes.windll.user32.PostMessageW
FindWindowW = ctypes.windll.user32.FindWindowW
SetForegroundWindow = ctypes.windll.user32.SetForegroundWindow
GetForegroundWindow = ctypes.windll.user32.GetForegroundWindow
GetWindowTextLengthW = ctypes.windll.user32.GetWindowTextLengthW
GetWindowTextW = ctypes.windll.user32.GetWindowTextW
IsWindowVisible = ctypes.windll.user32.IsWindowVisible
BringWindowToTop = ctypes.windll.user32.BringWindowToTop

PUL = ctypes.POINTER(ctypes.c_ulong)

KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_SCANCODE = 0x0008
WM_KEYDOWN = 0x0100
WM_KEYUP = 0x0101

VK_MAP = {
    'z': 0x5A, 'x': 0x58, 'c': 0x43, 'v': 0x56, 'b': 0x42, 'n': 0x4E, 'm': 0x4D,
    'a': 0x41, 's': 0x53, 'd': 0x44, 'f': 0x46, 'g': 0x47, 'h': 0x48, 'j': 0x4A,
    'q': 0x51, 'w': 0x57, 'e': 0x45, 'r': 0x52, 't': 0x54, 'y': 0x59, 'u': 0x55,
}

class KeyBdInput(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", PUL)
    ]

class Input_I(ctypes.Union):
    _fields_ = [("ki", KeyBdInput)]

class Input(ctypes.Structure):
    _fields_ = [
        ("type", wintypes.DWORD),
        ("ii", Input_I)
    ]

current_method = "keybd_event"
window_handle = None

def set_method(method):
    global current_method
    current_method = method
    print(f"使用键盘输入方式: {method}")

def set_window_title(title):
    global window_handle
    if title:
        window_handle = FindWindowW(None, title)
        if window_handle:
            print(f"找到窗口: {title}")
        else:
            print(f"未找到窗口: {title}")
    else:
        window_handle = None

def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def run_as_admin():
    if not is_admin():
        script = os.path.abspath(sys.argv[0])
        params = ' '.join([script] + sys.argv[1:])
        ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, params, None, 1)
        sys.exit()

def get_foreground_window_title():
    hwnd = GetForegroundWindow()
    length = GetWindowTextLengthW(hwnd)
    buffer = ctypes.create_unicode_buffer(length + 1)
    GetWindowTextW(hwnd, buffer, length + 1)
    return buffer.value

def activate_window():
    if window_handle:
        SetForegroundWindow(window_handle)
        BringWindowToTop(window_handle)
        time.sleep(0.1)

def key_down_sendinput(key):
    extra = ctypes.c_ulong(0)
    ii_ = Input_I()
    scan_code = ctypes.windll.user32.MapVirtualKeyA(VK_MAP.get(key, 0), 0)
    vk_code = VK_MAP.get(key, 0)
    ii_.ki = KeyBdInput(vk_code, scan_code, 0, 0, ctypes.pointer(extra))
    x = Input(type=1, ii=ii_)
    SendInput(1, ctypes.byref(x), ctypes.sizeof(x))
    time.sleep(0.01)

def key_up_sendinput(key):
    extra = ctypes.c_ulong(0)
    ii_ = Input_I()
    scan_code = ctypes.windll.user32.MapVirtualKeyA(VK_MAP.get(key, 0), 0)
    vk_code = VK_MAP.get(key, 0)
    ii_.ki = KeyBdInput(vk_code, scan_code, KEYEVENTF_KEYUP, 0, ctypes.pointer(extra))
    x = Input(type=1, ii=ii_)
    SendInput(1, ctypes.byref(x), ctypes.sizeof(x))
    time.sleep(0.01)

def key_down_keybdevent(key):
    scan_code = ctypes.windll.user32.MapVirtualKeyA(VK_MAP.get(key, 0), 0)
    vk_code = VK_MAP.get(key, 0)
    keybd_event(vk_code, scan_code, 0, 0)
    time.sleep(0.01)

def key_up_keybdevent(key):
    scan_code = ctypes.windll.user32.MapVirtualKeyA(VK_MAP.get(key, 0), 0)
    vk_code = VK_MAP.get(key, 0)
    keybd_event(vk_code, scan_code, KEYEVENTF_KEYUP, 0)
    time.sleep(0.01)

def key_down_postmessage(key):
    if window_handle:
        vk_code = VK_MAP.get(key, 0)
        PostMessageW(window_handle, WM_KEYDOWN, vk_code, 0)
    time.sleep(0.01)

def key_up_postmessage(key):
    if window_handle:
        vk_code = VK_MAP.get(key, 0)
        PostMessageW(window_handle, WM_KEYUP, vk_code, 0)
    time.sleep(0.01)

def key_down(key):
    if current_method == "sendinput":
        key_down_sendinput(key)
    elif current_method == "postmessage":
        key_down_postmessage(key)
    else:
        key_down_keybdevent(key)

def key_up(key):
    if current_method == "sendinput":
        key_up_sendinput(key)
    elif current_method == "postmessage":
        key_up_postmessage(key)
    else:
        key_up_keybdevent(key)

NOTE_MAP = {
    "1": "z",
    "2": "x",
    "3": "c",
    "4": "v",
    "5": "b",
    "6": "n",
    "7": "m",
    "1+": "a",
    "2+": "s",
    "3+": "d",
    "4+": "f",
    "5+": "g",
    "6+": "h",
    "7+": "j",
    "1++": "q",
    "2++": "w",
    "3++": "e",
    "4++": "r",
    "5++": "t",
    "6++": "y",
    "7++": "u",
}


def load_events(path: str):
    with open(path, "r", encoding="utf-8") as f:
        events = json.load(f)

    for e in events:
        if "at" not in e or "key" not in e or "duration" not in e:
            raise ValueError(f"事件缺少字段: {e}")
        e["at"] = float(e["at"])
        e["duration"] = float(e["duration"])
        e["key"] = str(e["key"])
    return events


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


def load_text_events(path: str, note_map: dict):
    events = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) != 3:
                raise ValueError(f"格式错误: {line}")
            at, note_str, duration = parts
            keys = parse_notes(note_str, note_map)
            for key in keys:
                events.append({
                    "at": float(at),
                    "key": key,
                    "duration": float(duration)
                })
    return events


def build_timeline(events):
    timeline = []
    for e in events:
        start = e["at"] / 1000.0
        end = (e["at"] + e["duration"]) / 1000.0

        timeline.append((start, 0, "down", e["key"]))
        timeline.append((end, 1, "up", e["key"]))

    timeline.sort(key=lambda x: (x[0], x[1]))
    return timeline


def play(events, start_delay=2.0):
    print(f"当前管理员权限: {'是' if is_admin() else '否'}")
    print(f"建议: 如无法控制游戏，请尝试以管理员身份运行")
    print(f"\n可用键盘输入方式:")
    print(f"  keybd_event (默认, 兼容性最好)")
    print(f"  sendinput (SendInput API)")
    print(f"  postmessage (PostMessage API, 需要窗口标题)")
    print(f"\n使用 --method 方式名 切换")
    print(f"使用 --window 窗口标题 指定目标窗口\n")
    
    print(f"请在 {start_delay} 秒内切换到目标窗口...")
    time.sleep(start_delay)
    
    print(f"当前前台窗口: {get_foreground_window_title()}")
    if window_handle:
        activate_window()

    timeline = build_timeline(events)
    t0 = time.perf_counter()
    
    pressed_keys = set()

    for i, (target_time, _, action, key) in enumerate(timeline):
        while True:
            now = time.perf_counter() - t0
            wait = target_time - now
            if wait <= 0:
                break
            time.sleep(min(wait, 0.001))

        now = time.perf_counter() - t0
        now_ms = int(now * 1000)
        print(f"[{now_ms}] {action.upper()} {key}")

        if action == "down":
            if key not in pressed_keys:
                key_down(key)
                pressed_keys.add(key)
        else:
            if key in pressed_keys:
                key_up(key)
                pressed_keys.remove(key)
    
    print("\n演奏完成！确保所有按键已释放...")
    for key in list(pressed_keys):
        print(f"释放剩余按键: {key}")
        key_up(key)
        pressed_keys.remove(key)
    
    print("演奏结束！")


def list_songs(songs_dir="songs"):
    songs_path = Path(songs_dir)
    if not songs_path.exists():
        return []
    
    songs = []
    for file in sorted(songs_path.glob("*.txt")):
        songs.append(str(file))
    return songs

def select_song(songs):
    print("\n可用曲目:")
    for i, song in enumerate(songs, 1):
        song_name = Path(song).stem
        print(f"  {i}. {song_name}")
    
    while True:
        try:
            choice = input("\n请选择曲目编号 (1-{}): ".format(len(songs))).strip()
            if not choice:
                return songs[0]
            index = int(choice) - 1
            if 0 <= index < len(songs):
                return songs[index]
            print("请输入有效的编号！")
        except ValueError:
            print("请输入有效的数字！")

if __name__ == "__main__":
    path = None
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--method" and i + 1 < len(sys.argv):
            set_method(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == "--window" and i + 1 < len(sys.argv):
            set_window_title(sys.argv[i + 1])
            i += 2
        else:
            path = sys.argv[i]
            i += 1

    songs = list_songs()
    if not songs and path is None:
        print("songs目录下没有找到txt文件！")
        sys.exit(1)
    
    if path is None:
        path = select_song(songs)
        print(f"\n已选择: {Path(path).stem}")

    if path.endswith(".json"):
        events = load_events(path)
    else:
        events = load_text_events(path, NOTE_MAP)

    # 用户输入倒计时时间
    while True:
        try:
            delay_input = input("请输入倒计时时间 (1-30 秒, 默认3秒): ").strip()
            if not delay_input:
                delay = 3.0
                break
            delay = float(delay_input)
            if 1 <= delay <= 30:
                break
            else:
                print("请输入 1 到 30 之间的数字！")
        except ValueError:
            print("请输入有效的数字！")
    
    play(events, start_delay=delay)
