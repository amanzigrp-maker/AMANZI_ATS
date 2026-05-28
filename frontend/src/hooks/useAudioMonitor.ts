import { useEffect, useRef } from 'react';
import { getFeatureFlags } from '../utils/featureFlags';

export const useAudioMonitor = (
  stream: MediaStream | null,
  onViolation: (type: string, detail: string) => void,
  onDebugUpdate?: (audioLevel: number, speechDetected: boolean) => void
) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const checkInterval = useRef<NodeJS.Timeout | null>(null);
  const lastViolationTimeRef = useRef<number>(0);

  // Rolling history of speech band energy (checked every 200ms, ~10 seconds history)
  const speechHistory = useRef<number[]>([]);
  const historyLimit = 50;

  const onViolationRef = useRef(onViolation);
  const onDebugUpdateRef = useRef(onDebugUpdate);
  const lastViolationTimeRef = useRef<number>(0);

  useEffect(() => {
    onViolationRef.current = onViolation;
    onDebugUpdateRef.current = onDebugUpdate;
  }, [onViolation, onDebugUpdate]);

  useEffect(() => {
    const flags = getFeatureFlags();
    if (!flags.enableProctoring) {
      console.warn('useAudioMonitor: Proctoring disabled by feature flag; skipping audio monitoring.');
      return;
    }

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
        let consecutiveLoudIntervals = 0;

        const pollingInterval = flags.forceCpu ? 800 : 500;
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

<<<<<<< Updated upstream
            // Estimate the noise floor as the minimum speech band energy over the last 3s.
            // Capping at 70 (instead of 25) prevents extreme spikes while allowing full adaptation to microphones with high static/baseline hum.
            const noiseFloor = speechHistory.current.length > 0 ? Math.min(...speechHistory.current, 70) : 25;
            
            // Speech detected if current speech band energy is significantly higher than noise floor (medium, moderate sensitivity)
            const speechThreshold = 22; // Calibrated moderate sensitivity threshold
            const isSpeechDetected = avgSpeech > noiseFloor + speechThreshold && avgSpeech > 38;
=======
            // Estimate the noise floor as the minimum speech band energy over the last 3s
            // Raised cap from 10 to 30 to adapt to noisy room background hums (AC, fans, PC cooler)
            const noiseFloor = Math.min(...speechHistory.current, 30);
            
            // Speech detected if current speech band energy is significantly higher than noise floor and above a calibrated threshold
            // We increase thresholds to avoid false positives on soft ambient sounds / keyboard clicks / breathing
            const speechThreshold = 25; // Raised from 18 to 25
            const isSpeechDetected = avgSpeech > noiseFloor + speechThreshold && avgSpeech > 40; // Raised from 35 to 40
>>>>>>> Stashed changes

            // High volume detected if overall average total volume is above a high volume threshold (calibrated for loud sounds)
            const highVolumeThreshold = 80; // Raised from 55 to 80
            const isHighVolumeDetected = avgTotal > highVolumeThreshold;

            console.debug(`[Audio VAD Monitor] speechLevel=${avgSpeech.toFixed(1)} noiseFloor=${noiseFloor.toFixed(1)} speechDetected=${isSpeechDetected} volumeLevel=${avgTotal.toFixed(1)} loud=${isHighVolumeDetected}`);

            if (onDebugUpdateRef.current) {
              onDebugUpdateRef.current(avgTotal, isSpeechDetected);
            }

            const nowTime = Date.now();
            const cooldownMs = 15000; // 15 seconds cooldown

            // Handle Speech Detection Violation (sustained voice activity of other persons)
            if (isSpeechDetected) {
              consecutiveSpeechIntervals++;
<<<<<<< Updated upstream
              // Trigger violation if speaking persists for 10 consecutive checks (~2.0 seconds of sustained speech)
              if (consecutiveSpeechIntervals >= 10) {
                const now = Date.now();
                // Cooldown of 15 seconds between consecutive audio warnings to prevent rapid accumulation of warnings
                if (now - lastViolationTimeRef.current > 15000) {
                  if (onViolationRef.current) {
                    onViolationRef.current('Abnormal Audio Detected', `Voice activity/speech detected in the background (level: ${avgSpeech.toFixed(1)})`);
                  }
                  lastViolationTimeRef.current = now;
=======
              if (consecutiveSpeechIntervals >= 3) {
                if (nowTime - lastViolationTimeRef.current > cooldownMs) {
                  if (onViolationRef.current) {
                    onViolationRef.current(
                      'Abnormal Audio Detected',
                      `Voice activity/speech audio detected in the background (level: ${avgSpeech.toFixed(1)})`
                    );
                    lastViolationTimeRef.current = nowTime;
                  }
                } else {
                  console.debug(`[Audio VAD Monitor] Speech detected but throttled by cooldown (remaining: ${((cooldownMs - (nowTime - lastViolationTimeRef.current)) / 1000).toFixed(1)}s)`);
>>>>>>> Stashed changes
                }
                consecutiveSpeechIntervals = 0; // Reset
              }
            } else {
              if (consecutiveSpeechIntervals > 0) {
                consecutiveSpeechIntervals--;
              }
            }

            // Handle High Volume Detection Violation (sustained loud background noise)
            if (isHighVolumeDetected) {
              consecutiveLoudIntervals++;
              if (consecutiveLoudIntervals >= 3) {
                if (nowTime - lastViolationTimeRef.current > cooldownMs) {
                  if (onViolationRef.current) {
                    onViolationRef.current(
                      'High Volume Detected',
                      `High volume audio or loud background noise detected (level: ${avgTotal.toFixed(1)})`
                    );
                    lastViolationTimeRef.current = nowTime;
                  }
                } else {
                  console.debug(`[Audio VAD Monitor] Loud noise detected but throttled by cooldown (remaining: ${((cooldownMs - (nowTime - lastViolationTimeRef.current)) / 1000).toFixed(1)}s)`);
                }
                consecutiveLoudIntervals = 0; // Reset
              }
            } else {
              if (consecutiveLoudIntervals > 0) {
                consecutiveLoudIntervals--;
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
