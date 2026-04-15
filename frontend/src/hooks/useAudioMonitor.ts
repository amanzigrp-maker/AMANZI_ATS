import { useEffect, useRef } from 'react';

export const useAudioMonitor = (
  stream: MediaStream | null,
  onViolation: (type: string, detail: string) => void
) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const checkInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!stream) return;

    const setupAudio = async () => {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      checkInterval.current = setInterval(() => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((p, c) => p + c, 0) / bufferLength;

          // Threshold for "abnormal noise" - can be calibrated
          if (average > 60) {
            onViolation('Abnormal Audio Detected', `High noise level detected: ${average.toFixed(2)}`);
          }
        }
      }, 2000);
    };

    setupAudio();

    return () => {
      if (checkInterval.current) clearInterval(checkInterval.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [stream]);

  return null;
};
