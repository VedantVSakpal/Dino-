import os
import uuid
import soundfile as sf
import onnxruntime as ort
from kokoro_onnx import Kokoro

class TTSManager:
    def __init__(self):
        self.model_path = os.path.join(os.path.dirname(__file__), "kokoro-v1.0.onnx")
        self.voices_path = os.path.join(os.path.dirname(__file__), "voices-v1.0.bin")
        self._kokoro = None

    @property
    def kokoro(self):
        if self._kokoro is None:
            if not os.path.exists(self.model_path) or not os.path.exists(self.voices_path):
                raise FileNotFoundError("Kokoro ONNX model and/or voices file not found. Please run download_models.py first.")
            
            print("Loading Kokoro ONNX model session with optimized thread settings...")
            sess_opts = ort.SessionOptions()
            sess_opts.intra_op_num_threads = 6
            sess_opts.inter_op_num_threads = 1
            
            # Explicitly configure InferenceSession with optimized SessionOptions
            session = ort.InferenceSession(
                self.model_path, 
                sess_options=sess_opts, 
                providers=["CPUExecutionProvider"]
            )
            self._kokoro = Kokoro.from_session(session, self.voices_path)
            print("Kokoro session loaded successfully.")
        return self._kokoro

    def warmup(self):
        """
        Warms up the TTS engine by forcing session load and running a dummy generation.
        """
        try:
            print("Warming up TTS session...")
            # Trigger property loading
            _ = self.kokoro
            # Run dummy generation to warm up compilation/first-run overhead
            self.kokoro.create("warmup", voice="af_sarah", speed=1.0, lang="en-us")
            print("TTS Warmup completed successfully!")
        except Exception as e:
            print(f"Error during TTS warmup: {e}")


    def generate_speech(self, text, voice="af_sarah", speed=1.0, lang="en-us", output_dir="static/audio"):
        """
        Generates a WAV file from the text using Kokoro ONNX and saves it in the output directory.
        Returns the filename.
        """
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
        
        # Clean old audio files to prevent disk bloat
        self._cleanup_audio_dir(output_dir)
        
        try:
            # Generate audio samples
            samples, sample_rate = self.kokoro.create(
                text,
                voice=voice,
                speed=speed,
                lang=lang
            )
            
            # Save audio file
            filename = f"response_{uuid.uuid4().hex[:8]}.wav"
            filepath = os.path.join(output_dir, filename)
            sf.write(filepath, samples, sample_rate)
            return filename
        except Exception as e:
            print(f"Error in TTS generation: {e}")
            raise e

    def _cleanup_audio_dir(self, output_dir, max_files=20):
        """
        Keeps the static/audio directory clean by keeping only the most recent files.
        """
        try:
            files = [os.path.join(output_dir, f) for f in os.listdir(output_dir) if f.endswith(".wav")]
            if len(files) > max_files:
                # Sort by modification time (oldest first)
                files.sort(key=os.path.getmtime)
                # Remove oldest files
                for f in files[:-max_files]:
                    try:
                        os.remove(f)
                    except OSError:
                        pass
        except Exception as e:
            print(f"Error during audio cleanup: {e}")

# Instantiate a single global TTS manager
tts_manager = TTSManager()
