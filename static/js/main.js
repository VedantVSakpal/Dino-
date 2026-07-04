document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const micBtn = document.getElementById("mic-btn");
    const stopBtn = document.getElementById("stop-btn");
    const settingsToggleBtn = document.getElementById("settings-toggle-btn");
    const settingsPanel = document.getElementById("settings-panel");
    const statusDot = document.getElementById("status-dot");
    const statusText = document.getElementById("status-text");
    const visualizerCircle = document.getElementById("visualizer-circle");
    const visualizerMicIcon = document.getElementById("visualizer-mic-icon");
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
    
    // Conversational History State
    let chatHistory = [];
    let currentAssistantResponse = "";

    // Web Audio API State for Dynamic Visualizer & VAD Barge-In
    let audioCtx = null;
    let micAnalyser = null;
    let playerAnalyser = null;
    let micSource = null;
    let audioSource = null;
    let micStream = null;
    let animationFrameId = null;

    // VAD Barge-In Tuning Parameters
    const VAD_THRESHOLD = 45; // Volume threshold (0-255) to trigger interruption
    const VAD_REQUIRED_FRAMES = 15; // Consecutive frames (~250ms) of speaking required
    let consecutiveSpeakingFrames = 0;

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
                // If it ended naturally, transition to thinking state
                setUIState("thinking");
            }
        };
    } else {
        micBtn.disabled = true;
        userText.textContent = "Web Speech API is not supported in this browser. Please use Google Chrome or Edge.";
        console.warn("Speech Recognition API not supported in this browser.");
    }

    // Web Audio API Initialization
    function initAudio(stream) {
        if (audioCtx) return;
        
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // 1. Microphone Analyzer (Used for User volume scale & VAD Barge-In)
            micAnalyser = audioCtx.createAnalyser();
            micAnalyser.fftSize = 64; // Low FFT size is efficient for volume detection
            micSource = audioCtx.createMediaStreamSource(stream);
            micSource.connect(micAnalyser);
            
            // 2. Audio Player Analyzer (Used for Assistant volume scale)
            playerAnalyser = audioCtx.createAnalyser();
            playerAnalyser.fftSize = 64;
            audioSource = audioCtx.createMediaElementSource(audioPlayer);
            audioSource.connect(playerAnalyser);
            playerAnalyser.connect(audioCtx.destination);
            
            startVisualizerLoop();
        } catch (e) {
            console.error("Error setting up Web Audio API nodes:", e);
        }
    }

    // Real-time Visualizer and Interruption Detection loop
    function startVisualizerLoop() {
        const micDataArray = new Uint8Array(32);
        const playerDataArray = new Uint8Array(32);

        function draw() {
            animationFrameId = requestAnimationFrame(draw);
            
            if (isListening && micAnalyser) {
                // Scale circle to user speech volume
                micAnalyser.getByteFrequencyData(micDataArray);
                let micVol = getAverageVolume(micDataArray);
                scaleCircle(micVol, "rgba(236, 72, 153, 0.5)"); // Pink glow
            } 
            else if (isSpeaking && playerAnalyser && micAnalyser) {
                // Scale circle to assistant audio output
                playerAnalyser.getByteFrequencyData(playerDataArray);
                let playerVol = getAverageVolume(playerDataArray);
                scaleCircle(playerVol, "rgba(56, 189, 248, 0.5)"); // Cyan/Blue glow
                
                // Monitor mic for barge-in (interruption)
                micAnalyser.getByteFrequencyData(micDataArray);
                let micVol = getAverageVolume(micDataArray);
                
                if (micVol > VAD_THRESHOLD) {
                    consecutiveSpeakingFrames++;
                    if (consecutiveSpeakingFrames >= VAD_REQUIRED_FRAMES) {
                        console.log("User speaking detected. Triggering barge-in.");
                        consecutiveSpeakingFrames = 0;
                        stopAudio(true, true); // (isInterrupted = true, startListeningAfter = true)
                    }
                } else {
                    consecutiveSpeakingFrames = Math.max(0, consecutiveSpeakingFrames - 1);
                }
            } 
            else {
                // Reset styling when idle or thinking
                if (visualizerCircle && !visualizerCircle.classList.contains("thinking")) {
                    visualizerCircle.style.transform = "";
                    visualizerCircle.style.boxShadow = "";
                }
            }
        }
        
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        draw();
    }

    function getAverageVolume(dataArray) {
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        return sum / dataArray.length;
    }

    function scaleCircle(volume, glowColor) {
        if (!visualizerCircle) return;
        // volume maps from 0-255
        let scale = 1.0 + (volume / 255) * 0.7; // Scale up to 1.7x
        let glowRadius = 15 + (volume / 255) * 40; // Expand glow boundary
        
        visualizerCircle.style.transform = `scale(${scale})`;
        visualizerCircle.style.boxShadow = `0 0 ${glowRadius}px ${glowColor}`;
    }

    // UI State Management
    function setUIState(state) {
        if (visualizerCircle) {
            visualizerCircle.classList.remove("listening", "thinking", "speaking");
        }
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
                if (visualizerMicIcon) {
                    visualizerMicIcon.className = "fa-solid fa-microphone visualizer-mic-icon";
                }
                stopBtn.disabled = true;
                break;
            case "listening":
                isListening = true;
                isSpeaking = false;
                statusText.textContent = "Listening...";
                statusDot.style.backgroundColor = "#ec4899"; // Pink
                statusDot.style.boxShadow = "0 0 8px #ec4899";
                if (visualizerCircle) visualizerCircle.classList.add("listening");
                micBtn.classList.add("active");
                if (visualizerMicIcon) {
                    visualizerMicIcon.className = "fa-solid fa-square visualizer-mic-icon"; // Stop square
                }
                stopBtn.disabled = true;
                break;
            case "thinking":
                isListening = false;
                isSpeaking = false;
                statusText.textContent = "Thinking...";
                statusDot.style.backgroundColor = "#06b6d4"; // Cyan
                statusDot.style.boxShadow = "0 0 8px #06b6d4";
                if (visualizerCircle) visualizerCircle.classList.add("thinking");
                micBtn.classList.remove("active");
                if (visualizerMicIcon) {
                    visualizerMicIcon.className = "fa-solid fa-microphone visualizer-mic-icon";
                }
                stopBtn.disabled = true;
                break;
            case "speaking":
                isListening = false;
                isSpeaking = true;
                statusText.textContent = "Speaking...";
                statusDot.style.backgroundColor = "#3b82f6"; // Blue
                statusDot.style.boxShadow = "0 0 8px #3b82f6";
                if (visualizerCircle) visualizerCircle.classList.add("speaking");
                micBtn.classList.remove("active");
                if (visualizerMicIcon) {
                    visualizerMicIcon.className = "fa-solid fa-volume-high visualizer-mic-icon"; // Volume waves
                }
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

    // Mic Click Handler
    micBtn.addEventListener("click", () => {
        handleMicClick();
    });

    // Click handler for the visualizer circle itself
    if (visualizerCircle) {
        visualizerCircle.addEventListener("click", () => {
            handleMicClick();
        });
    }

    function handleMicClick() {
        if (!recognition) return;
        
        // Initialize AudioContext on the first user gesture
        if (!audioCtx) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    micStream = stream;
                    initAudio(stream);
                    startRecognitionFlow();
                })
                .catch(err => {
                    console.error("Mic access denied:", err);
                    userText.textContent = "Microphone access denied. Please enable mic permissions in your browser.";
                });
        } else {
            startRecognitionFlow();
        }
    }

    function startRecognitionFlow() {
        if (isListening) {
            manualStop = true;
            recognition.stop();
            setUIState("ready");
            userText.textContent = "Recording cancelled.";
        } else {
            stopAudio(false); // Stop any ongoing playback normally
            userText.textContent = "Listening...";
            assistantText.textContent = "Waiting for response...";
            try {
                recognition.start();
            } catch (err) {
                console.error("Failed to start recognition:", err);
                setUIState("ready");
            }
        }
    }

    // Stop Playback Button Handler
    stopBtn.addEventListener("click", () => {
        stopAudio(false);
    });

    // Function to Send Text Query to Backend
    function sendQueryToBackend(queryText) {
        setUIState("thinking");

        const payload = {
            message: queryText,
            history: chatHistory, // Contains only past conversation turns
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

            // Save user query to history now that we successfully got a response
            chatHistory.push({ role: "user", text: queryText });

            assistantText.textContent = data.response;
            currentAssistantResponse = data.response;

            if (data.audio_url) {
                playAudio(data.audio_url);
            } else {
                // If no audio is returned, push full text to history immediately
                chatHistory.push({ role: "model", text: currentAssistantResponse });
                currentAssistantResponse = "";
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
        stopAudio(false); // Ensure any existing audio is cleared
        
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

    function stopAudio(isInterrupted = false, startListeningAfter = false) {
        if (!audioPlayer.paused) {
            audioPlayer.pause();
        }
        
        // Handle interruption history truncation
        if (isSpeaking && currentAssistantResponse) {
            let finalizedText = currentAssistantResponse;
            if (isInterrupted) {
                finalizedText = getInterruptedText(currentAssistantResponse, audioPlayer.currentTime, audioPlayer.duration);
                assistantText.textContent = finalizedText;
                console.log(`Audio cut off. Saved partial text to memory: "${finalizedText}"`);
            }
            
            chatHistory.push({ role: "model", text: finalizedText });
            currentAssistantResponse = ""; // Reset
        }
        
        audioPlayer.src = "";
        setUIState("ready");

        if (startListeningAfter) {
            // Trigger auto-listen for conversational flow
            setTimeout(() => {
                startRecognitionFlow();
            }, 300);
        }
    }

    // Calculates which words the user actually heard based on play duration percentage
    function getInterruptedText(text, currentTime, duration) {
        if (!duration || isNaN(duration) || currentTime >= duration - 0.5) {
            return text;
        }
        
        const words = text.split(" ");
        const playPercent = currentTime / duration;
        const wordsToKeep = Math.ceil(words.length * playPercent);
        
        if (wordsToKeep <= 0) return "...";
        return words.slice(0, wordsToKeep).join(" ") + "... [interrupted]";
    }

    // Reset UI and append full response to history when audio ends naturally
    audioPlayer.addEventListener("ended", () => {
        if (isSpeaking && currentAssistantResponse) {
            chatHistory.push({ role: "model", text: currentAssistantResponse });
            currentAssistantResponse = "";
        }
        setUIState("ready");
    });
});
