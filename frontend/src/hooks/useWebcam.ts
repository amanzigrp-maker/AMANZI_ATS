import { useState, useCallback, useRef, useEffect } from 'react';

export const useWebcam = () => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startWebcam = useCallback(async () => {
    // Prevent duplicate webcam allocations (Fix 5)
    if (streamRef.current) {
      console.debug("useWebcam: Webcam stream already active. Returning existing stream.");
      return streamRef.current;
    }

    try {
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: true
        });
      } catch (fallbackErr) {
        console.warn("Preferred 720p resolution failed, trying fallback constraints:", fallbackErr);
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          },
          audio: true
        });
      }
      setStream(mediaStream);
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      return mediaStream;
    } catch (err) {
      console.error("Error accessing webcam:", err);
      setError("Webcam access denied. Please enable camera permissions.");
      return null;
    }
  }, []);

  const stopWebcam = useCallback(() => {
    console.debug("useWebcam: Releasing and cleaning up active webcam streams (Fix 5)...");
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.debug(`[useWebcam] Track ${track.kind} stopped.`);
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
  }, []);

  // Guarantee total MediaStream resource cleanup on hook unmount (Fix 5)
  useEffect(() => {
    console.log("useWebcam: Mounted diagnostics active.");
    return () => {
      console.log("useWebcam: Unmounting. Cleaning up active media resources...");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  return { stream, startWebcam, stopWebcam, videoRef, error };
};
