# AutoPiano

A simple web-based piano application with keyboard play and auto-play features.

## Quick Start

### Using Python Launcher (Recommended)

1. Double-click `start.bat` or run `python launch.py`
2. **One terminal only** - All services managed in one window
3. **Auto-opens browser** to http://localhost:8000
4. Press `Ctrl+C` to stop all services

### Manual Start

**Backend (Flask)**:
```bash
cd backend
python app.py
```

**Frontend (HTTP Server)**:
```bash
cd frontend
python -m http.server 8000
```

## Usage

### Keyboard Play
- **Bass (C3-B3)**: Z X C V B N M
- **Middle (C4-B4)**: A S D F G H J
- **Treble (C5-B5)**: Q W E R T Y U

### Mouse Play
- Click on piano keys to play sounds

### Auto Play
1. Select a song from the dropdown
2. Click "🎵 自动播放" button

## Adding Songs

1. Place song files (.txt format) in the `songs` folder
2. Refresh the page, new songs will appear in the selection list automatically

## Song Format

Format: `time(ms) note duration(ms)`

Example:
```
0       5+      375
375     2++     375
750     1++     375
```

Note mapping:
- 1-7 (C3-B3): z-x-c-v-b-n-m
- 1+-7+ (C4-B4): a-s-d-f-g-h-j
- 1++-7++ (C5-B5): q-w-e-r-t-y-u

## Project Structure

```
autoPiano/
├── backend/           # Backend Flask application
│   └── app.py
├── frontend/          # Frontend web application
│   ├── index.html
│   └── main.js
├── songs/             # Songs folder
│   ├── song1.txt
│   ├── song2.txt
│   └── ...
├── macro_player.py    # Terminal-based auto player
├── launch.py          # Python service launcher (RECOMMENDED)
├── start.bat          # Launch via Python
└── README.md
```

## Stopping Services

Press `Ctrl+C` in the service window to stop all services.