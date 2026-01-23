// static/js/libs/voice.js

let recognition = null;
let isListening = false;

export function toggleVoiceInput(onText, onStart, onEnd) {
    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        alert("Speech recognition not supported in this browser.");
        return;
    }

    if (!recognition) {
        recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.interimResults = true;
        recognition.continuous = false;

        recognition.onresult = (event) => {
            let transcript = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            onText(transcript);
        };

        recognition.onerror = (e) => {
            console.error("Voice error:", e);
            stop();
        };

        recognition.onend = () => {
            isListening = false;
            onEnd && onEnd();
        };
    }

    function stop() {
        if (recognition && isListening) {
            recognition.stop();
            isListening = false;
        }
    }

    if (!isListening) {
        isListening = true;
        onStart && onStart();
        recognition.start();
    } else {
        stop();
    }
}
