import React, { useState, useRef, useEffect } from 'react';
import './VirtualFriend.css';
import { getBotResponse } from './ChatService';
import AvatarVideo from "./AI-talking-avatar.mp4";

const VirtualFriend = () => {
    const videoRef = useRef(null);
    const userCameraRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const recognitionRef = useRef(null);
    const utteranceQueueRef = useRef([]);
    const isSpeakingRef = useRef(false);

    const [isSpeaking, setIsSpeaking] = useState(false);
    const [botReply, setBotReply] = useState('');
    const [micPermissionStatus, setMicPermissionStatus] = useState('');
    const [conversationHistory, setConversationHistory] = useState([]);
    const [apiError, setApiError] = useState(null);
    const [availableVoices, setAvailableVoices] = useState([]);
    const [selectedVoice, setSelectedVoice] = useState(null);
    const [isRecognitionActive, setIsRecognitionActive] = useState(false);
    const recognitionTimeoutRef = useRef(null);

    const updateSpeakingState = (isSpeaking) => {
        isSpeakingRef.current = isSpeaking;
        setIsSpeaking(isSpeaking);
        
        if (videoRef.current) {
            if (isSpeaking) {
                videoRef.current.play();
            } else {
                videoRef.current.pause();
            }
        }
    };

    // Process speech queue
    const processUtteranceQueue = async () => {
        if (utteranceQueueRef.current.length === 0) {
            updateSpeakingState(false);
            // Add a small delay before restarting recognition
            setTimeout(() => {
                if (!isRecognitionActive && recognitionRef.current) {
                    try {
                        recognitionRef.current.start();
                        setIsRecognitionActive(true);
                    } catch (error) {
                        console.error('Failed to restart recognition after speaking:', error);
                        initializeSpeechRecognition();
                    }
                }
            }, 1000);
            return;
        }

        if (isSpeakingRef.current) {
            return;
        }

        const currentUtterance = utteranceQueueRef.current[0];
        updateSpeakingState(true);

        return new Promise((resolve) => {
            currentUtterance.onend = () => {
                utteranceQueueRef.current.shift();
                updateSpeakingState(false);
                setTimeout(() => processUtteranceQueue(), 100);
                resolve();
            };

            currentUtterance.onerror = (event) => {
                console.error("Utterance error:", event);
                utteranceQueueRef.current.shift();
                updateSpeakingState(false);
                processUtteranceQueue();
                resolve();
            };

            try {
                window.speechSynthesis.speak(currentUtterance);
            } catch (error) {
                console.error("Speech synthesis error:", error);
                updateSpeakingState(false);
                processUtteranceQueue();
                resolve();
            }
        });
    };


    // Enhanced speak function
    const speak = async (text) => {
        try {
            // Stop any current speech and recognition
            window.speechSynthesis.cancel();
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            
            // Clear the queue
            utteranceQueueRef.current = [];
            
            // Get available voices
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(voice =>
                voice.name.includes('Samantha') ||
                voice.name.includes('Microsoft Zira') ||
                voice.name.includes('Microsoft Eva') ||
                voice.name.includes('Google US English') ||
                (voice.lang === 'en-US' && voice.name.includes('Female'))
            ) || voices.find(voice => voice.lang === 'en-US') || voices[0];
    
            // Split text into sentences more carefully
            const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
            
            // Create utterances
            sentences.forEach((sentence, index) => {
                const utterance = new SpeechSynthesisUtterance(sentence.trim());
                utterance.voice = preferredVoice;
                utterance.pitch = 1.1;
                utterance.rate = 0.95;
                utterance.volume = 1.0;
                
                // Add debugging
                console.log(`Creating utterance ${index + 1}/${sentences.length}: ${sentence}`);
                
                utteranceQueueRef.current.push(utterance);
            });
    
            // Start processing the queue
            await processUtteranceQueue();
        } catch (error) {
            console.error("Speech setup error:", error);
            updateSpeakingState(false);
            restartRecognition(recognitionRef.current);
        }
    };


     // Initialize voices
     const initializeVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        setAvailableVoices(voices);
        // Set a default voice
        if (voices.length > 0) {
            setSelectedVoice(voices[0]);
        }
    };

    // Request Microphone Permissions
    const requestMicPermission = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            setMicPermissionStatus('granted');
            initializeSpeechRecognition();
        } catch (err) {
            console.error('Microphone permission denied:', err);
            setMicPermissionStatus('denied');
        }
    };

    // Initialize Speech Recognition
    const initializeSpeechRecognition = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error('SpeechRecognition not supported');
            return;
        }

        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.continuous = true;

        recognition.onstart = () => {
            console.log('Speech recognition started');
            setIsRecognitionActive(true);
            if (recognitionTimeoutRef.current) {
                clearTimeout(recognitionTimeoutRef.current);
            }
        };

        recognition.onresult = async (event) => {
            try {
                const userMessage = event.results[event.results.length - 1][0].transcript;
                const confidence = event.results[event.results.length - 1][0].confidence;

                if (confidence < 0.7) {
                    console.warn("Low confidence speech. Ignoring.");
                    return;
                }

                recognition.stop();
                setIsRecognitionActive(false);

                setConversationHistory(prevHistory => [...prevHistory, { role: 'user', content: userMessage }]);

                const response = await getBotResponse(userMessage, conversationHistory);
                
                
                if (response) {
                    setApiError(null);
                    setConversationHistory(response.updatedHistory);
                    setBotReply(response.response);
                }
            } catch (error) {
                console.error('Error processing speech result:', error);
                setApiError(error.message);
                speak("I apologize, but I'm experiencing technical difficulties. Would you like to try again?");
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            setIsRecognitionActive(false);

            switch (event.error) {
                case 'network':
                    setApiError('Network connection issue. Please check your internet connection.');
                    break;
                case 'not-allowed':
                    setMicPermissionStatus('denied');
                    break;
                case 'aborted':
                case 'no-speech':
                    setTimeout(() => restartRecognition(recognition), 1000);
                    break;
                default:
                    setTimeout(() => restartRecognition(recognition), 1000);
            }
        };

        recognition.onend = () => {
            console.log("Speech recognition ended");
            setIsRecognitionActive(false);
            
            if (!isSpeakingRef.current) {
                setTimeout(() => restartRecognition(recognition), 1000);
            }
        };

        try {
            recognition.start();
            recognitionRef.current = recognition;
            setIsRecognitionActive(true);
        } catch (error) {
            console.error('Failed to start recognition:', error);
            setTimeout(() => restartRecognition(recognition), 3000);
        }
    };


    const restartRecognition = (recognition) => {
        if (!recognition) {
            console.log('Creating new recognition instance');
            initializeSpeechRecognition();
            return;
        }

        if (recognitionTimeoutRef.current) {
            clearTimeout(recognitionTimeoutRef.current);
        }

        recognitionTimeoutRef.current = setTimeout(() => {
            if (!isSpeakingRef.current && !isRecognitionActive) {
                console.log('Starting recognition');
                try {
                    recognition.start();
                    setIsRecognitionActive(true);
                } catch (error) {
                    console.error('Recognition start failed:', error);
                    initializeSpeechRecognition();
                }
            }
        }, 1000);
    };


    useEffect(() => {
        return () => {
            if (recognitionTimeoutRef.current) {
                clearTimeout(recognitionTimeoutRef.current);
            }
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            window.speechSynthesis.cancel();
        };
    }, []);

    // Initialize camera
    useEffect(() => {
        let mounted = true;

        const initializeCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (mounted) {
                    mediaStreamRef.current = stream;
                    if (userCameraRef.current) {
                        userCameraRef.current.srcObject = stream;
                    }
                }
            } catch (error) {
                console.error('Error accessing camera:', error);
            }
        };

        initializeCamera();

        return () => {
            mounted = false;
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    // Voice initialization and Microphone Permission
    useEffect(() => {
        let mounted = true;

        const initVoicesAndRecognition = () => {
            window.speechSynthesis.getVoices(); // Ensure voices are loaded
            requestMicPermission(); // Request microphone permissions after voices are ready
        };

        const handleVoicesChanged = () => {
            if (window.speechSynthesis.getVoices().length > 0) {
                initVoicesAndRecognition(); // Call the initialization function
                window.speechSynthesis.onvoiceschanged = null; // Remove the event listener
            }
        };

        // Check if voices are already available
        if (window.speechSynthesis.getVoices().length > 0) {
            initVoicesAndRecognition();
        } else {
            window.speechSynthesis.onvoiceschanged = handleVoicesChanged; // Set the event listener
        }

        return () => {
            mounted = false;
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            window.speechSynthesis.cancel();
            window.speechSynthesis.onvoiceschanged = null; // Clean up the event listener
        };
    }, []);

     // Speak when botReply changes
     useEffect(() => {
        if (botReply) {
            speak(botReply);
        }
    }, [botReply]);


  const renderAPIError = () => {
    if (!apiError) return null;

    return (
      <div className="error-container">
        <div className="error-content">
          <h3>Connection Issue</h3>
          <p>There seems to be a problem connecting to the AI service.</p>
          <div className="error-details">
            <h4>Error Details</h4>
            <p>{apiError}</p>
          </div>
          <button 
            onClick={() => {
              setApiError(null);
              if (recognitionRef.current) {
                try {
                  recognitionRef.current.start();
                } catch (error) {
                  console.error('Failed to restart recognition:', error);
                }
              }
            }}
            className="retry-button"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="virtual-friend-container">
      {renderAPIError()}
      
      {micPermissionStatus === 'denied' && (
        <div className="permission-warning">
          <p>Please grant microphone permissions to use speech recognition</p>
          <button onClick={requestMicPermission}>Request Permissions</button>
        </div>
      )}
      
      <div className="avatar-video">
        <video ref={videoRef} src={AvatarVideo} loop muted />
      </div>
      
      <div className="camera-feed">
        <video ref={userCameraRef} autoPlay playsInline muted />
      </div>
    </div>
  );
};

export default VirtualFriend;
