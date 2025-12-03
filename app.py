import os
import csv
import traceback
from io import BytesIO

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from PyPDF2 import PdfReader
import google.generativeai as genai


# ============================================================
#  LOAD ENVIRONMENT
# ============================================================
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
DEFAULT_MODEL = "gemini-2.5-flash-preview-09-2025"

if not GEMINI_API_KEY:
    print("\n⚠️ WARNING: GEMINI_API_KEY missing in .env file. Assuming environment handles authentication.\n")


# ============================================================
#  FLASK APP SETUP
# ============================================================
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    genai.configure() 


# ============================================================
#  HELPER FUNCTIONS
# ============================================================

def read_pdf(file) -> str:
    """Extract text from PDF safely."""
    try:
        file.seek(0)
        reader = PdfReader(file)
        pages = []
        for i, p in enumerate(reader.pages):
            if i >= 10: break # Limit pages
            txt = p.extract_text() or ""
            if txt.strip():
                pages.append(txt)
        return "\n".join(pages)
    except Exception as e:
        return f"[PDF read error: {e}]"


def read_txt(file) -> str:
    """Read generic text file."""
    try:
        file.seek(0)
        raw = file.read()
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return raw.decode("latin-1", errors="ignore")
    except Exception as e:
        return f"[TXT read error: {e}]"


def read_csv_file(file) -> str:
    """Read CSV and produce a small preview (max 60 rows)."""
    try:
        file.seek(0)
        text = file.read().decode("utf-8", errors="ignore")
        rows = list(csv.reader(text.splitlines()))
        max_rows = 60
        if len(rows) > max_rows:
            rows = rows[:max_rows] + [["... TRUNCATED ..."]]
        return "\n".join([", ".join(r) for r in rows])
    except Exception as e:
        return f"[CSV read error: {e}]"


def process_files(files):
    """Returns: list of (filename, text_content)."""
    data = []
    for f in files:
        name = f.filename or "file"
        file_stream = BytesIO(f.read())
        
        if name.lower().endswith(".pdf"):
            txt = read_pdf(file_stream)
        elif name.lower().endswith(".csv"):
            txt = read_csv_file(file_stream)
        elif name.lower().endswith(".txt") or name.lower().endswith(".log"):
            txt = read_txt(file_stream)
        else:
            txt = f"[Unsupported file type: {name}]"

        data.append((name, txt))
    return data


def build_prompt(user_prompt: str, file_context):
    """
    Constructs the detailed system prompt for the Gemini model, 
    enforcing structure, no-$-symbol rule, and code language preference.
    """
    
    # Logic to detect and enforce requested code language (FIX for C++ issue)
    prompt_lower = user_prompt.lower()
    code_lang = "Python" # Default
    if "c++ code" in prompt_lower or "cpp code" in prompt_lower:
        code_lang = "C++"
    elif "java code" in prompt_lower:
        code_lang = "Java"
    elif "javascript code" in prompt_lower or "js code" in prompt_lower:
        code_lang = "JavaScript"
    
    # FIX: Strict No-Dollar-Symbol ($) enforcement everywhere.
    base = f"""
You are an expert actuarial analysis assistant.

Your entire response MUST be clean and structured into four sections using Markdown ### headings.
CRITICAL RULE: **DO NOT use the dollar symbol ($) or double dollar symbol ($$) anywhere in your response.** Use only standard characters, words, or Markdown formatting.

### Explanation
Explain clearly in simple language. If you need to write a fraction, use standard notation like '4/5' or write 'four divided by five'.

### Code
Write clean, minimal code related to the actuarial problem in **{code_lang}**. If no language is specified, use Python.

### Time & Space Complexity
Provide a detailed breakdown of the complexity in a comprehensive Markdown table format, with clear workings. Use standard notation like O(log n), O(n^2), or O(1).
Example Table Structure:
| Metric | Complexity | Working/Reasoning |
|:---|:---|:---|
| **Time Complexity** | O(n log n) | The algorithm involves sorting (n log n) and a linear scan (n). The overall time is dominated by the sorting step. |
| **Space Complexity** | O(n) | Requires auxiliary space proportional to the input size 'n' to store intermediate results. |

### Suggestions
Provide suggestions for improving the code, performance, security, or related actuarial assumptions.

USER PROMPT:
{user_prompt}

"""

    if file_context:
        base += "\n\nUPLOADS PROVIDED:\n"
        for fname, text in file_context:
            base += f"\n--- FILE: {fname} ---\n{text[:10000]}\n"

    base += "\nFollow the exact format strictly.\n"

    return base


# ============================================================
#  ROUTES
# ============================================================

@app.route("/health")
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/analyze", methods=["POST"])
def analyze():
    """Handles the core analysis request by calling the Gemini API."""
    try:
        prompt = request.form.get("prompt", "").strip()
        model_name = request.form.get("model", DEFAULT_MODEL)

        if not prompt:
            return jsonify({"error": "Prompt cannot be empty!"}), 400

        # Process uploaded files
        files = request.files.getlist("files")
        file_context = process_files(files)

        # Build the final prompt for the AI
        full_prompt = build_prompt(prompt, file_context)

        # Send to Gemini API
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(full_prompt)

        output = getattr(response, "text", "").strip()

        if not output:
            return jsonify({"error": "Empty response from Gemini API"}), 500

        # FIX: Set Code Quality to "A+" as requested
        metrics = {
            "quality": "A+", 
            "complexity": "O(1)", # Default baseline
            "security": "Low Risk"
        }
        
        # Heuristics to set Complexity metric for the Indicator Box
        if "chain ladder" in prompt.lower() or "ibnr" in prompt.lower():
            metrics["complexity"] = "O(n^2)" 
        elif "binary search" in prompt.lower() or "logarithmic" in prompt.lower():
            metrics["complexity"] = "O(log n)"
        elif "sort" in prompt.lower():
             metrics["complexity"] = "O(n log n)"

        return jsonify({
            "content": output,
            "model_used": model_name,
            "metrics": metrics 
        })

    except Exception as e:
        traceback.print_exc() 
        return jsonify({"error": f"Server error: {str(e)}"}), 500


# ============================================================
#  MAIN
# ============================================================
if __name__ == "__main__":
    print("\n🚀 GenAI Actuarial Backend Running…")
    print("→ http://127.0.0.1:5000")
    print("→ CTRL + C to stop\n")

    app.run(host="127.0.0.1", port=5000, debug=False)


from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def home():
    return render_template("login.html")

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
