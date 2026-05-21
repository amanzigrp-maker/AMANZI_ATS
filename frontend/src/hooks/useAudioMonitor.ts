import { useEffect, useRef } from 'react';

export const useAudioMonitor = (
  stream: MediaStream | null,
  onViolation: (type: string, detail: string) => void,
  onDebugUpdate?: (audioLevel: number, speechDetected: boolean) => void
) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const checkInterval = useRef<NodeJS.Timeout | null>(null);

  // Rolling history of speech band energy (checked every 200ms, ~3 seconds history)
  const speechHistory = useRef<number[]>([]);
  const historyLimit = 15;

  const onViolationRef = useRef(onViolation);
  const onDebugUpdateRef = useRef(onDebugUpdate);

  useEffect(() => {
    onViolationRef.current = onViolation;
    onDebugUpdateRef.current = onDebugUpdate;
  }, [onViolation, onDebugUpdate]);

  useEffect(() => {
    if (!stream) return;

    const setupAudio = async () => {
      try {
        console.debug("useAudioMonitor: Initializing AudioContext...");
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) {
          console.warn("useAudioMonitor: Web Audio API not supported in this browser.");
          return;
        }

        audioContextRef.current = new AudioContextClass();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        
        // fftSize of 512 gives 256 frequency bins
        analyserRef.current.fftSize = 512;
        analyserRef.current.smoothingTimeConstant = 0.4;
        source.connect(analyserRef.current);

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const sampleRate = audioContextRef.current.sampleRate;

        // Calculate frequency corresponding to each bin: frequency = binIndex * sampleRate / fftSize
        // Human speech is concentrated between 250Hz and 3500Hz
        const binSize = sampleRate / analyserRef.current.fftSize;
        const speechMinBin = Math.floor(250 / binSize);
        const speechMaxBin = Math.min(Math.ceil(3500 / binSize), bufferLength - 1);

        let consecutiveSpeechIntervals = 0;

        checkInterval.current = setInterval(() => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);

            let speechSum = 0;
            let totalSum = 0;
            for (let i = 0; i < bufferLength; i++) {
              totalSum += dataArray[i];
              if (i >= speechMinBin && i <= speechMaxBin) {
                speechSum += dataArray[i];
              }
            }

            const speechCount = speechMaxBin - speechMinBin + 1;
            const avgSpeech = speechSum / speechCount;
            const avgTotal = totalSum / bufferLength;

            // Track rolling speech band energy to dynamically estimate noise floor
            speechHistory.current.push(avgSpeech);
            if (speechHistory.current.length > historyLimit) {
              speechHistory.current.shift();
            }

            // Estimate the noise floor as the minimum speech band energy over the last 3s
            const noiseFloor = Math.min(...speechHistory.current, 10);
            
            // Speech detected if current speech band energy is significantly higher than noise floor
            const speechThreshold = 18; // Calibrated sensitivity threshold
            const isSpeechDetected = avgSpeech > noiseFloor + speechThreshold && avgSpeech > 20;

            console.debug(`[Audio VAD Monitor] speechLevel=${avgSpeech.toFixed(1)} noiseFloor=${noiseFloor.toFixed(1)} speechDetected=${isSpeechDetected}`);

            if (onDebugUpdateRef.current) {
              onDebugUpdateRef.current(avgTotal, isSpeechDetected);
            }

            if (isSpeechDetected) {
              consecutiveSpeechIntervals++;
              // Trigger violation if speaking persists for 3 consecutive checks (~600ms of sustained speech)
              if (consecutiveSpeechIntervals >= 3) {
                if (onViolationRef.current) {
                  onViolationRef.current('Abnormal Audio Detected', `Voice activity/speech detected in the background (level: ${avgSpeech.toFixed(1)})`);
                }
                consecutiveSpeechIntervals = 0; // Reset or throttle
              }
            } else {
              if (consecutiveSpeechIntervals > 0) {
                consecutiveSpeechIntervals--;
              }
            }
          }
        }, 200);
      } catch (err) {
        console.error("useAudioMonitor: Error setting up audio monitoring:", err);
      }
    };

    setupAudio();

    return () => {
      console.debug("useAudioMonitor: Cleaning up AudioContext and interval...");
      if (checkInterval.current) clearInterval(checkInterval.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(err => {
          console.warn("useAudioMonitor: Error closing AudioContext:", err);
        });
      }
    };
  }, [stream]);

  return null;
};
