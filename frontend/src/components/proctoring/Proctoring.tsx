import React, { useEffect, useState, useRef } from 'react';
import { useWebcam } from '../../hooks/useWebcam';
import { useFaceDetection } from '../../hooks/useFaceDetection';
import { useAudioMonitor } from '../../hooks/useAudioMonitor';
import { useRecording } from '../../hooks/useRecording';
import { useProctoringSocket } from '../../hooks/useProctoringSocket';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { ShieldAlert, Video, MicOff, Maximize, Monitor, MonitorOff, Terminal } from 'lucide-react';

interface ProctoringProps {
  interviewId: string;
  candidateId: string;
  onTerminate: () => void;
}

const Proctoring: React.FC<ProctoringProps> = ({ interviewId, candidateId, onTerminate }) => {
  const [warnings, setWarnings] = useState(0);
  const [lastWarning, setLastWarning] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => Boolean(document.fullscreenElement));
  const maxWarnings = 3;
  const fullscreenStartWarningSentRef = useRef(false);
  const displayCheckIntervalRef = useRef<number | null>(null);
  const remoteAccessCheckIntervalRef = useRef<number | null>(null);

  const { startWebcam, stopWebcam, videoRef, stream, error: cameraError } = useWebcam();
  const socket = useProctoringSocket(interviewId, candidateId, 'candidate');

  const handleViolation = (type: string, detail: string) => {
    setWarnings(prev => {
      const newCount = prev + 1;
      setLastWarning(`${type}: ${detail}`);
      
      socket.emitWarning(type, detail);

      if (newCount >= maxWarnings) {
        socket.emitViolation('Test Terminated', 'Maximum warnings exceeded');
        onTerminate();
      }
      return newCount;
    });
  };

  const { startMonitoring, stopMonitoring } = useFaceDetection(videoRef, handleViolation);
  useAudioMonitor(stream, handleViolation);
  const { startRecording, stopRecording } = useRecording(stream);

  useEffect(() => {
    startWebcam().then((s) => {
      if (s) {
        startRecording();
        startMonitoring();
      }
    });

    if (!document.fullscreenElement && !fullscreenStartWarningSentRef.current) {
      fullscreenStartWarningSentRef.current = true;
      handleViolation('Fullscreen Required', 'Interview started without fullscreen mode enabled');
    }

    // Enforcement: Fullscreen
    const handleFullscreenChange = () => {
      const activeFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(activeFullscreen);
      if (!activeFullscreen) {
        handleViolation('Fullscreen Exited', 'Test must be taken in fullscreen mode');
      }
    };

    // Enforcement: Tab Switch
    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleViolation('Tab Switch Detected', 'Candidate switched tabs during the test');
      }
    };

    // Enforcement: Copy/Paste
    const handleCopyPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      handleViolation('Copy/Paste Blocked', 'Copying or pasting is not allowed');
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('copy', handleCopyPaste);
    document.addEventListener('paste', handleCopyPaste);

    // Enforcement: Multiple Displays
    const checkMultipleDisplays = async () => {
      try {
        // Modern Window Management API
        if ('getScreenDetails' in window || 'isExtended' in window.screen) {
          if ((window.screen as any).isExtended) {
            handleViolation('Multiple Displays', 'Additional display devices detected. Only one monitor is allowed.');
          }
        } else {
          // Fallback: check screen width vs window width (less reliable but better than nothing)
          // Some setups report huge width for spanned monitors
          if (window.screen.width > 2560 && window.screen.width > window.screen.availWidth * 1.5) {
             handleViolation('Multiple Displays', 'Suspicious screen configuration detected. Possible secondary monitor.');
          }
        }
      } catch (err) {
        console.warn('Failed to check display details:', err);
      }
    };

    // Enforcement: Remote Access Detection (Basic)
    const checkRemoteAccess = () => {
      // 1. Check for Automation/Webdriver
      if (navigator.webdriver) {
        handleViolation('Remote Access/Automation', 'Automation or remote control tool detected via WebDriver.');
      }

      // 2. Check for suspicious user agent patterns (some remote tools append strings)
      const suspiciousAgents = ['HeadlessChrome', 'Cypress', 'Selenium', 'Puppeteer'];
      if (suspiciousAgents.some(agent => navigator.userAgent.includes(agent))) {
        handleViolation('Remote Access/Automation', 'Unauthorized browser environment detected.');
      }

      // 3. Screen sharing detection (if browser supports)
      // Note: This is usually for when the user is ALREADY sharing their screen via the browser
    };

    // Initial checks
    checkMultipleDisplays();
    checkRemoteAccess();

    // Periodic checks
    displayCheckIntervalRef.current = window.setInterval(checkMultipleDisplays, 10000); // Every 10s
    remoteAccessCheckIntervalRef.current = window.setInterval(checkRemoteAccess, 15000); // Every 15s

    // Add listener for screen change if supported
    if ('screen' in window && 'onchange' in (window.screen as any)) {
      (window.screen as any).addEventListener('change', checkMultipleDisplays);
    }

    return () => {
      stopWebcam();
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('copy', handleCopyPaste);
      document.removeEventListener('paste', handleCopyPaste);
      if (displayCheckIntervalRef.current) clearInterval(displayCheckIntervalRef.current);
      if (remoteAccessCheckIntervalRef.current) clearInterval(remoteAccessCheckIntervalRef.current);
      if ('screen' in window && 'onchange' in (window.screen as any)) {
        (window.screen as any).removeEventListener('change', checkMultipleDisplays);
      }
    };
  }, []);

  const pcRef = useRef<RTCPeerConnection | null>(null);

  // WebRTC Signaling for Live Feed
  useEffect(() => {
    if (socket.isLiveEnabled && stream && !pcRef.current) {
      console.log("📺 Live monitoring enabled, starting WebRTC...");
      
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.socket?.emit('signal', { interviewId, signal: { candidate: event.candidate } });
        }
      };

      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socket.socket?.emit('signal', { interviewId, signal: { sdp: offer } });
      });

      pcRef.current = pc;
    }

    if (!socket.isLiveEnabled && pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Handle incoming signals from Admin (Answers/ICE)
    const handleSignal = (data: { from: string; signal: any }) => {
      if (!pcRef.current) return;
      
      if (data.signal.sdp && data.signal.sdp.type === 'answer') {
        pcRef.current.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
      } else if (data.signal.candidate) {
        pcRef.current.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
      }
    };

    socket.socket?.on('signal', handleSignal);
    return () => {
      socket.socket?.off('signal', handleSignal);
    };
  }, [socket.isLiveEnabled, stream]);

  const handleRequestFullscreen = () => {
    document.documentElement.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`);
    });
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-4 w-64 pointer-events-none">
      {/* Webcam Preview */}
      <div className="relative rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black aspect-video pointer-events-auto">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        <div className="absolute top-2 left-2 flex items-center gap-2 bg-black/50 backdrop-blur-md px-2 py-1 rounded-md text-[10px] text-white">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          REC LIVE
        </div>
      </div>

      {/* Warning UI */}
      {warnings > 0 && (
        <Alert variant="destructive" className="bg-red-950/90 border-red-500 text-white animate-in slide-in-from-right pointer-events-auto">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Warning {warnings}/{maxWarnings}</AlertTitle>
          <AlertDescription className="text-xs">
            {lastWarning}
          </AlertDescription>
        </Alert>
      )}

      {/* Fullscreen Tooltip */}
      {!isFullscreen && (
        <button
          onClick={handleRequestFullscreen}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs flex items-center justify-center gap-2 shadow-lg transition-all pointer-events-auto"
        >
          <Maximize className="w-4 h-4" />
          Enter Fullscreen
        </button>
      )}

      {cameraError && (
        <Alert variant="destructive" className="bg-red-950 border-red-500 text-white pointer-events-auto">
          <Video className="h-4 w-4" />
          <AlertTitle>Camera Error</AlertTitle>
          <AlertDescription className="text-xs">
            {cameraError}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default Proctoring;
