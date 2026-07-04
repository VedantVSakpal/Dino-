# AURA - AI Voice Assistant

AURA is a local, voice-first AI Assistant that queries a local knowledge base using RAG (Retrieval-Augmented Generation) powered by Gemini, and speaks the response back using an offline local Text-to-Speech (TTS) engine.

## 🚀 Setup Instructions

Follow these steps to set up and run the application locally on your machine:

### 1. Clone the repository
```bash
git clone <repository-url>
cd deno
```

### 2. Create and Activate a Virtual Environment
* **Windows (PowerShell)**:
  ```powershell
  python -m venv .venv
  .venv\Scripts\Activate.ps1
  ```
* **macOS / Linux**:
  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  ```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Download local TTS Models
Before running the app, you need to download the local Kokoro ONNX model and voice mappings (~350MB total). We have provided a script that does this automatically:
```bash
python download_models.py
```

### 5. Set up your Gemini API Key
Create a file named `.env` in the root folder of the project and add your Gemini API Key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 6. Run the Application
Start the Flask web server:
```bash
python app.py
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your web browser (Chrome/Edge is recommended for mic permissions), click the microphone, and start speaking!
