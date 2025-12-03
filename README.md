# ⚙️ GenAI Analysis Studio

> **Modern AI-Powered Code Analysis Dashboard**  
> Turn any problem statement or code snippet into **structured explanations, clean code, and time & space complexity** insights — powered by **Google Gemini AI**.


---

## 🚀 Overview

**GenAI Analysis Studio** is a full-stack web app that acts as an AI assistant for developers and students.  
It allows you to **upload code or text**, select an AI model, and instantly get:

- 💡 *Explanations* of logic or concepts  
- 🧠 *Generated & optimized code*  
- 📈 *Time & Space complexity analysis*



---

## 🧩 Features

### 🎨 Frontend
- Responsive **glassmorphic UI** (HTML + CSS + JS)
- Tabs for **Explanation**, **Code**, and **Complexity**
- **History panel** for past analyses (stored locally)
- Supports **file uploads** (PDF, TXT, CSV)

### 🤖 Backend
- Flask server using **Google Gemini API**
- Supports multiple model selections:
  - `gemini-2.5-flash-preview-09-2025`
  - `gemini-2.5-flash-lite-preview-09-2025`
  - `gemini-pro-latest`
- Preprocessing for text, PDF, and CSV files
- Structured output format for frontend parsing
- CORS-enabled for local testing or deployment

---

## 🛠️ Tech Stack

| Layer | Technology | Description |
|-------|-------------|-------------|
| **Frontend** | HTML5, CSS3, JavaScript (Vanilla) | Responsive UI + interactions |
| **Styling** | CSS Variables, Flex/Grid Layout | Modern, fluid, adaptive design |
| **Backend** | Flask, Flask-CORS | REST API for AI requests |
| **AI Model** | Google Gemini (via `google.generativeai`) | Code analysis and generation |
| **File Handling** | PyPDF2, CSV, I/O | Multi-format context input |
| **Storage** | LocalStorage | History and theme persistence |

---

## ⚙️ Setup Instructions

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/<your-username>/genai-analysis-studio.git
cd genai-analysis-studio
