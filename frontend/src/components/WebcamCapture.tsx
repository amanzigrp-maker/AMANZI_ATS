import React, { useRef, useState, useEffect } from 'react';
import { Video, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WebcamCaptureProps {
  onCapture: (image: string) => void;
}

export const WebcamCapture: React.FC<WebcamCaptureProps> = ({ onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 400, height: 400, facingMode: 'user' } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError(null);
    } catch (err) {
      console.error('Error accessing webcam:', err);
      setError('Webcam access denied or not available. Please enable camera permissions to proceed.');
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        context.drawImage(videoRef.current, 0, 0, 400, 400);
        const imageData = canvasRef.current.toDataURL('image/jpeg', 0.8);
        setCapturedImage(imageData);
        onCapture(imageData);
      }
    }
  };

  const resetCapture = () => {
    setCapturedImage(null);
    startCamera();
  };

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center">
        <p className="text-red-600 font-medium mb-4">{error}</p>
        <Button onClick={startCamera} variant="outline" className="border-red-200 text-red-600 hover:bg-red-100">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-64 h-64 rounded-2xl overflow-hidden bg-slate-100 border-2 border-slate-200 shadow-inner">
        {!capturedImage ? (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover mirror"
          />
        ) : (
          <img 
            src={capturedImage} 
            alt="Captured" 
            className="w-full h-full object-cover" 
          />
        )}
        
        {!capturedImage && (
          <div className="absolute inset-0 border-2 border-dashed border-white/40 rounded-2xl pointer-events-none m-4" />
        )}
      </div>

      <canvas ref={canvasRef} width={400} height={400} className="hidden" />

      <div className="flex gap-3">
        {!capturedImage ? (
          <Button onClick={capturePhoto} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6 py-2 flex items-center gap-2">
            <Video className="w-4 h-4" />
            Capture Photo
          </Button>
        ) : (
          <>
            <Button onClick={resetCapture} variant="outline" className="rounded-xl px-4 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Retake
            </Button>
            <div className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
              <CheckCircle2 className="w-5 h-5" />
              Verified
            </div>
          </>
        )}
      </div>
      
      <p className="text-xs text-slate-500 max-w-[240px] text-center">
        Your photo will be included on your certificate for identity verification.
      </p>
    </div>
  );
};
