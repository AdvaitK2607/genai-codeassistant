import os
import csv
import traceback
from io import BytesIO

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

from PyPDF2 import PdfReader
import google.generativeai as genai

# ============================================================
# LOAD ENVIRONMENT
# ============================================================
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
DEFAULT_MODEL = "gemini-2.5-flash-preview-09-2025"

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    genai.configure()

# ============================================================
# FLASK APP (ONE ONLY)
# ============================================================
app = Flask(__name__)
CORS(app)

# ============================================================
# FRONTEND FILES (NO templates/static)
# ============================================================

@app.route("/")
def home():
    return send_from_directory(".", "login.html")

@app.route("/style.css")
def css():
    return send_from_directory(".", "style.css")

@app.route("/script.js")
def js():
    return send_from_directory(".", "script.js")

@app.route("/favicon.ico")
def favicon():
    return "", 204

# ============================================================
# HELPERS
# ============================================================

def read_pdf(file):
    try:
        reader = PdfReader(file)
        return "\n".join(p.extract_text() or "" for p in reader.pages[:10])
    except Exception as e:
        return f"[PDF error: {e}]"

def read_text(file):
    try:
        return file.read().decode("utf-8", errors="ignore")
    except Exception as e:
        return f"[TXT error: {e}]"

def process_files(files):
    data = []
    for f in files:
        buf = BytesIO(f.read())
        name = f.filename or "file"

        if name.endswith(".pdf"):
            txt = read_pdf(buf)
        elif name.endswith((".txt", ".log")):
            txt = read_text(buf)
        else:
            txt = "Unsupported file type"

        data.append((name, txt))
    return data

# ============================================================
# API ROUTES
# ============================================================

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        prompt = request.form.get("prompt", "")
        if not prompt:
            return jsonify({"error": "Empty prompt"}), 400

        files = request.files.getlist("files")
        context = process_files(files)

        model = genai.GenerativeModel(DEFAULT_MODEL)
        response = model.generate_content(prompt)

        return jsonify({
            "content": response.text if response else ""
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ============================================================
# MAIN (Render-compatible)
# ============================================================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
