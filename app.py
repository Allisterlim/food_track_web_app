from flask import Flask, send_from_directory
from werkzeug.utils import safe_join
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Get the absolute path to the directory containing this file
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/script.js')
def serve_script():
    return send_from_directory(BASE_DIR, 'script.js')

@app.route('/<path:path>')
def serve_files(path):
    try:
        safe_path = safe_join(BASE_DIR, path)
        if not safe_path:
            return "File not found", 404
        return send_from_directory(BASE_DIR, path)
    except Exception as e:
        app.logger.error(f"Error serving file {path}: {str(e)}")
        return "File not found", 404

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)