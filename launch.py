import os
import sys
import subprocess
import time
import webbrowser
import threading
from pathlib import Path

def read_output(process, prefix):
    """Read process output in a separate thread"""
    while True:
        line = process.stdout.readline()
        if not line:
            break
        print(f"[{prefix}] {line.strip()}")

def main():
    print("=" * 40)
    print("   AutoPiano - Service Launcher")
    print("=" * 40)
    print()

    script_dir = Path(__file__).parent

    # Check Python
    try:
        import flask
        print("[INFO] Python environment is ready")
    except ImportError:
        print("[WARNING] Flask not found, trying to install...")
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "flask", "flask-cors"], check=True)
        except:
            print("[ERROR] Failed to install dependencies")
            input("Press Enter to exit")
            return

    backend_process = None
    frontend_process = None

    try:
        # Start backend
        print("[INFO] Starting backend service...")
        backend_dir = script_dir / "backend"
        os.chdir(backend_dir)
        backend_process = subprocess.Popen(
            [sys.executable, "app.py"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )

        # Start output thread for backend
        backend_thread = threading.Thread(
            target=read_output,
            args=(backend_process, "BACKEND"),
            daemon=True
        )
        backend_thread.start()

        # Wait for backend to start
        print("[INFO] Waiting for backend to start...")
        time.sleep(3)

        # Start frontend
        print("[INFO] Starting frontend service...")
        frontend_dir = script_dir / "frontend"
        os.chdir(frontend_dir)
        frontend_process = subprocess.Popen(
            [sys.executable, "-m", "http.server", "8000"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )

        # Start output thread for frontend
        frontend_thread = threading.Thread(
            target=read_output,
            args=(frontend_process, "FRONTEND"),
            daemon=True
        )
        frontend_thread.start()

        os.chdir(script_dir)

        # Open browser
        print("[INFO] Opening browser...")
        time.sleep(1)
        webbrowser.open("http://localhost:8000")

        print()
        print("=" * 40)
        print("   Services Started!")
        print("=" * 40)
        print()
        print("Backend:  http://127.0.0.1:5000")
        print("Frontend: http://localhost:8000")
        print()
        print("Press Ctrl+C to stop all services...")
        print()

        # Keep script running
        while True:
            time.sleep(0.5)
            # Check if processes are still running
            if backend_process.poll() is not None:
                print("[ERROR] Backend service stopped")
                break
            if frontend_process.poll() is not None:
                print("[ERROR] Frontend service stopped")
                break

    except KeyboardInterrupt:
        print()
        print("[INFO] Stopping services...")
    finally:
        # Cleanup processes
        if backend_process:
            try:
                backend_process.terminate()
                print("[INFO] Backend stopped")
            except:
                pass

        if frontend_process:
            try:
                frontend_process.terminate()
                print("[INFO] Frontend stopped")
            except:
                pass

        print("[INFO] All services stopped")
        time.sleep(1)

if __name__ == "__main__":
    main()