document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const micBtn = document.getElementById("mic-btn");
    const micIcon = document.getElementById("mic-icon");
    const stopBtn = document.getElementById("stop-btn");
    const settingsToggleBtn = document.getElementById("settings-toggle-btn");
    const settingsPanel = document.getElementById("settings-panel");
    const statusDot = document.getElementById("status-dot");
    const statusText = document.getElementById("status-text");
    const waveformContainer = document.getElementById("waveform-container");
    const userText = document.getElementById("user-text");
    const assistantText = document.getElementById("assistant-text");
    
    const modelSelect = document.getElementById("model-select");
    const voiceSelect = document.getElementById("voice-select");
    const speedSlider = document.getElementById("speed-slider");
    const speedVal = document.getElementById("speed-val");
    
    const audioPlayer = document.getElementById("audio-player");

    // State Variables
    let isListening = false;
    let isSpeaking = false;
    let recognition = null;
    let manualStop = false;

    // Initialize Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            manualStop = false;
            setUIState("listening");
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userText.textContent = transcript;
            sendQueryToBackend(transcript);
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            if (manualStop) return; // Ignore errors if we intentionally clicked stop
            
            if (event.error === 'no-speech') {
                userText.textContent = "No speech was detected. Click mic to try again.";
            } else if (event.error === 'not-allowed') {
                userText.textContent = "Microphone access denied. Please enable mic permissions in your browser.";
            } else {
                userText.textContent = `Error: ${event.error}. Please check your microphone.`;
            }
            setUIState("ready");
        };

        recognition.onend = () => {
            if (isListening && !manualStop) {
                // If it ended naturally without trigger, transition to thinking state
                setUIState("thinking");
            }
        };
    } else {
        micBtn.disabled = true;
        userText.textContent = "Web Speech API is not supported in this browser. Please use Google Chrome or Edge.";
        console.warn("Speech Recognition API not supported in this browser.");
    }

    // UI State Management
    function setUIState(state) {
        // Reset visual classes
        waveformContainer.classList.remove("listening", "thinking", "speaking");
        statusDot.style.backgroundColor = "";
        statusDot.style.boxShadow = "";
        
        switch(state) {
            case "ready":
                isListening = false;
                isSpeaking = false;
                statusText.textContent = "Ready";
                statusDot.style.backgroundColor = "#10b981"; // Green
                statusDot.style.boxShadow = "0 0 8px #10b981";
                micBtn.classList.remove("active");
                micIcon.className = "fa-solid fa-microphone";
                stopBtn.disabled = true;
                break;
            case "listening":
                isListening = true;
                isSpeaking = false;
                statusText.textContent = "Listening...";
                statusDot.style.backgroundColor = "#ec4899"; // Pink
                statusDot.style.boxShadow = "0 0 8px #ec4899";
                waveformContainer.classList.add("listening");
                micBtn.classList.add("active");
                micIcon.className = "fa-solid fa-square"; // Stop symbol
                stopBtn.disabled = true;
                break;
            case "thinking":
                isListening = false;
                isSpeaking = false;
                statusText.textContent = "Thinking...";
                statusDot.style.backgroundColor = "#06b6d4"; // Cyan
                statusDot.style.boxShadow = "0 0 8px #06b6d4";
                waveformContainer.classList.add("thinking");
                micBtn.classList.remove("active");
                micIcon.className = "fa-solid fa-microphone";
                stopBtn.disabled = true;
                break;
            case "speaking":
                isListening = false;
                isSpeaking = true;
                statusText.textContent = "Speaking...";
                statusDot.style.backgroundColor = "#3b82f6"; // Blue
                statusDot.style.boxShadow = "0 0 8px #3b82f6";
                waveformContainer.classList.add("speaking");
                micBtn.classList.remove("active");
                stopBtn.disabled = false;
                break;
        }
    }

    // Toggle Settings Panel
    settingsToggleBtn.addEventListener("click", () => {
        settingsPanel.classList.toggle("hidden");
        settingsToggleBtn.classList.toggle("active");
    });

    // Speed Slider Value Display
    speedSlider.addEventListener("input", (e) => {
        speedVal.textContent = `${parseFloat(e.target.value).toFixed(1)}x`;
    });

    // Mic Click Event Handler
    micBtn.addEventListener("click", () => {
        if (!recognition) return;
        
        if (isListening) {
            manualStop = true;
            recognition.stop();
            setUIState("ready");
            userText.textContent = "Recording cancelled.";
        } else {
            // Stop any ongoing audio playback first
            stopAudio();
            userText.textContent = "Listening...";
            assistantText.textContent = "Waiting for response...";
            try {
                recognition.start();
            } catch (err) {
                console.error("Failed to start recognition:", err);
                setUIState("ready");
            }
        }
    });

    // Stop Playback Button Handler
    stopBtn.addEventListener("click", () => {
        stopAudio();
    });

    // Function to Send Text Query to Backend
    function sendQueryToBackend(queryText) {
        setUIState("thinking");

        const payload = {
            message: queryText,
            model: modelSelect.value,
            voice: voiceSelect.value,
            speed: parseFloat(speedSlider.value)
        };

        fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                assistantText.textContent = `Error: ${data.error}`;
                setUIState("ready");
                return;
            }

            assistantText.textContent = data.response;

            if (data.audio_url) {
                playAudio(data.audio_url);
            } else {
                setUIState("ready");
            }
        })
        .catch(error => {
            console.error("Error communicating with backend:", error);
            assistantText.textContent = "Error: Could not connect to the backend server.";
            setUIState("ready");
        });
    }

    // Playback control
    function playAudio(url) {
        stopAudio(); // Ensure any existing audio is cleared
        
        // Add cache buster to URL to force reload and prevent browser audio caching issues
        audioPlayer.src = `${url}?t=${Date.now()}`;
        audioPlayer.load();
        
        audioPlayer.play()
            .then(() => {
                setUIState("speaking");
            })
            .catch(err => {
                console.error("Audio playback error:", err);
                setUIState("ready");
            });
    }

    function stopAudio() {
        if (!audioPlayer.paused) {
            audioPlayer.pause();
        }
        audioPlayer.src = "";
        setUIState("ready");
    }

    // Reset UI when audio ends
    audioPlayer.addEventListener("ended", () => {
        setUIState("ready");
    });
});
