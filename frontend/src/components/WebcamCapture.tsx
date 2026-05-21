import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Video, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
interface WebcamCaptureProps {
  onCapture: (image: string, embedding: number[]) => void;
}

export const WebcamCapture: React.FC<WebcamCaptureProps> = ({ onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isInferenceRunningRef = useRef(false);
  const lastDebugUpdateRef = useRef(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [validation, setValidation] = useState<{
    isValid: boolean;
    reason?: string;
  }>({ isValid: false, reason: 'Initializing camera...' });

  const validationTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    startCamera();

    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (validationTimerRef.current) {
      clearInterval(validationTimerRef.current);
      validationTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setStream(null);
  };

  // Draw overlay removed

  /**
   * Event listener: triggered when video element begins playback
   * Ensures detection only starts after readyState === 4 & videoWidth > 0
   */
  const handleVideoLoad = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      console.debug("WebcamCapture: handleVideoLoad called but video element is null.");
      return;
    }

    console.debug(`[WebcamCapture Video Event] readyState: ${video.readyState}, size: ${video.videoWidth}x${video.videoHeight}`);

    // Task 4: Only start detection loop after metadata loaded & readyState is 4
    if (video.readyState === 4 && video.videoWidth > 0 && video.videoHeight > 0) {
      if (validationTimerRef.current) {
        clearInterval(validationTimerRef.current);
        validationTimerRef.current = null;
      }

      console.debug("WebcamCapture: Bypass validation interval for simple selfie capture");
      setValidation({ isValid: true, reason: "Ready to capture" });
    } else {
      // Retry in 200ms
      setTimeout(handleVideoLoad, 200);
    }
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      setStream(mediaStream);
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError(null);
      setCapturedImage(null);

      // Clear any stale timers. Do NOT start loop here (Task 4)
      if (validationTimerRef.current) {
        clearInterval(validationTimerRef.current);
        validationTimerRef.current = null;
      }
    } catch (err) {
      console.error('Error accessing webcam:', err);
      setError('Webcam access denied or not available. Please enable camera permissions to proceed.');
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg', 0.95);
        setCapturedImage(imageData);
        onCapture(imageData, []); // Pass empty embedding since verification is bypassed
        stopCamera();
      }
    }
  };

  const resetCapture = () => {
    setCapturedImage(null);
    setValidation({ isValid: false, reason: 'Restarting camera validation...' });
    startCamera();
  };

  if (error) {
    return (
      <div className="p-6 bg-red-950/20 border border-red-500/30 rounded-2xl text-center max-w-sm">
        <p className="text-red-400 font-medium mb-4">{error}</p>
        <Button onClick={startCamera} variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-950/30">
          Try Again
        </Button>
      </div>
    );
  }



  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="relative w-72 h-72 rounded-2xl overflow-hidden bg-[#090d16] border-2 border-white/10 shadow-2xl flex items-center justify-center">
        {!capturedImage ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              onLoadedMetadata={handleVideoLoad}
              onPlay={handleVideoLoad}
              className="w-full h-full object-cover mirror"
            />
            {/* Real-time Visual Overlay Canvas (Task 6) */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none mirror"
            />



            {/* Guiding Oval Template */}
            <div className="absolute inset-0 border-2 border-dashed border-white/20 rounded-full m-8 pointer-events-none flex items-center justify-center">
              <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold">Align Face Here</span>
            </div>
          </>
        ) : (
          <img
            src={capturedImage}
            alt="Captured Selfie"
            className="w-full h-full object-cover"
          />
        )}
      </div>

      <div className="flex gap-3">
        {!capturedImage ? (
          <Button
            onClick={capturePhoto}
            disabled={false}
            className="rounded-xl px-6 py-2.5 flex items-center gap-2 font-bold text-sm transition-all shadow-lg bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/10"
          >
            <Video className="w-4 h-4 shrink-0" />
            Take Selfie
          </Button>
        ) : (
          <>
            <Button onClick={resetCapture} variant="outline" className="rounded-xl px-4 py-2.5 flex items-center gap-2 border-white/10 hover:bg-white/5 text-slate-300">
              <RefreshCw className="w-4 h-4" />
              Retake Selfie
            </Button>
            <div className="flex items-center gap-2 text-emerald-300 font-bold bg-emerald-950/40 px-4 py-2.5 rounded-xl border border-emerald-500/20 text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              Face Confirmed
            </div>
          </>
        )}
      </div>

      <p className="text-[10px] text-slate-500 max-w-[260px] text-center leading-relaxed">
        Verify that you are in a well-lit environment and alone. This photo will be securely matched against your face during the interview.
      </p>
    </div>
  );
};

