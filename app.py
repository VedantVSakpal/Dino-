import os
import time
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from dotenv import load_dotenv
from google import genai
from google.genai import types

from rag_utils import get_rag_context
from tts_utils import tts_manager

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

# Ensure static/audio folder exists
os.makedirs(os.path.join(app.root_path, 'static', 'audio'), exist_ok=True)

# Fetch Gemini API Key
api_key = os.environ.get("GEMINI_API_KEY")
gemini_client = None

if api_key:
    try:
        gemini_client = genai.Client(api_key=api_key)
        print("Google GenAI client initialized.")
    except Exception as e:
        print(f"Error initializing Google GenAI Client: {e}")
else:
    print("Warning: GEMINI_API_KEY not found in environment or .env file.")

# Eagerly load and warm up the TTS engine at startup
try:
    tts_manager.warmup()
except Exception as tts_warmup_err:
    print(f"Warning: Failed to warm up TTS on startup: {tts_warmup_err}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    if not gemini_client:
        return jsonify({"error": "Gemini API client is not configured. Please add GEMINI_API_KEY to your .env file."}), 500

    data = request.get_json() or {}
    user_message = data.get("message", "").strip()
    selected_model = data.get("model", "gemini-2.5-flash").strip()
    voice = data.get("voice", "af_sarah").strip()
    speed = float(data.get("speed", 1.0))

    if not user_message:
        return jsonify({"error": "Message is required."}), 400

    # Load local knowledge base context
    t_start = time.time()
    rag_context = get_rag_context()
    t_rag = time.time() - t_start

    # System instruction guiding the AI voice response format
    system_instruction = (
        "You are a helpful, professional, and friendly AI Voice Assistant. "
        "Your answers must be concise, spoken-word friendly, and directly derived from the provided Knowledge Base context. "
        "Avoid formatting that is hard to read aloud, such as Markdown tables, bulleted lists, bold text (**), asterisks, or complex symbols. Keep answers extremely short, conversational, and direct (exactly 1 short sentence, under 12 words). "
        "Here is the local Knowledge Base context about Narendra Modi:\n\n"
        f"{rag_context}\n\n"
        "Only answer questions based on the above context. If the user asks about something not covered in the context, "
        "politely state that you do not have that information in your knowledge base."
    )

    try:
        # Query Gemini API using google-genai SDK
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.3,
            max_output_tokens=300
        )
        
        t_gemini_start = time.time()
        response = gemini_client.models.generate_content(
            model=selected_model,
            contents=user_message,
            config=config
        )
        t_gemini = time.time() - t_gemini_start
        
        response_text = response.text or "I apologize, but I could not generate a response."
        
        # Clean response text slightly for speech synthesis (remove extra whitespace/newlines)
        speech_text = response_text.replace('\n', ' ').strip()

        # Generate Speech using local Kokoro TTS ONNX engine
        t_tts_start = time.time()
        try:
            audio_filename = tts_manager.generate_speech(
                text=speech_text,
                voice=voice,
                speed=speed,
                output_dir=os.path.join(app.root_path, 'static', 'audio')
            )
            audio_url = f"/static/audio/{audio_filename}"
        except Exception as tts_err:
            print(f"TTS Generation failed: {tts_err}")
            audio_url = None
        t_tts = time.time() - t_tts_start
        
        t_total = time.time() - t_start
        print(f"[PROFILE] RAG: {t_rag:.3f}s | Gemini: {t_gemini:.3f}s | TTS: {t_tts:.3f}s | Total: {t_total:.3f}s", flush=True)

        return jsonify({
            "response": response_text,
            "audio_url": audio_url
        })

    except Exception as e:
        print(f"Error handling chat request: {e}")
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

@app.route('/api/tts', methods=['POST'])
def tts_only():
    data = request.get_json() or {}
    text = data.get("text", "").strip()
    voice = data.get("voice", "af_sarah").strip()
    speed = float(data.get("speed", 1.0))

    if not text:
        return jsonify({"error": "Text is required."}), 400

    try:
        audio_filename = tts_manager.generate_speech(
            text=text,
            voice=voice,
            speed=speed,
            output_dir=os.path.join(app.root_path, 'static', 'audio')
        )
        audio_url = f"/static/audio/{audio_filename}"
        return jsonify({"audio_url": audio_url})
    except Exception as e:
        print(f"Error in TTS endpoint: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
