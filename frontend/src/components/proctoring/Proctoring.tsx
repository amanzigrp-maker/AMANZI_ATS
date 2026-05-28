import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useWebcam } from '../../hooks/useWebcam';
import { useFaceDetection } from '../../hooks/useFaceDetection';
import { useAudioMonitor } from '../../hooks/useAudioMonitor';
import { useRecording } from '../../hooks/useRecording';
import { useProctoringSocket } from '../../hooks/useProctoringSocket';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { ShieldAlert, Video, Maximize } from 'lucide-react';
import { toast } from 'sonner';
import { useIdentityVerification } from '../../hooks/useIdentityVerification';
import { getFeatureFlags } from '../../utils/featureFlags';

interface ProctoringProps {
  interviewId: string;
  candidateId: string;
  onTerminate: () => void;
  referenceEmbedding?: number[] | null;
  referenceSelfie?: string | null;
}

const Proctoring: React.FC<ProctoringProps> = ({ 
  interviewId, 
  candidateId, 
  onTerminate,
  referenceEmbedding,
  referenceSelfie
}) => {
  const [warnings, setWarnings] = useState(0);
  const [lastWarning, setLastWarning] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => Boolean(document.fullscreenElement));
  const maxWarnings = 3;
  const fullscreenStartWarningSentRef = useRef(false);
  const displayCheckIntervalRef = useRef<number | null>(null);
  const remoteAccessCheckIntervalRef = useRef<number | null>(null);
  const devToolsCheckIntervalRef = useRef<number | null>(null);

  const [violationSnapshots, setViolationSnapshots] = useState<{
    type: string;
    timestamp: string;
    image: string;
  }[]>([]);

  const { startWebcam, stopWebcam, videoRef, stream, error: cameraError } = useWebcam();
  const socket = useProctoringSocket(interviewId, candidateId, 'candidate');

  // Identity verification states and callbacks
  const { validateFrame, compareEmbeddings, isModelLoaded } = useIdentityVerification();
  const [identitySimilarity, setIdentitySimilarity] = useState<number | null>(null);
  const [mismatchStreak, setMismatchStreak] = useState(0);
  const [identityWarningActive, setIdentityWarningActive] = useState(false);

  const logIdentityViolation = useCallback((similarity: number, type: string) => {
    let screenshot: string | null = null;
    try {
      if (videoRef.current && videoRef.current.readyState === 4) {
        const video = videoRef.current;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
          screenshot = tempCanvas.toDataURL('image/jpeg', 0.6);
        }
      }
    } catch (e) {
      console.warn("Failed to capture identity violation snapshot:", e);
    }

    if (screenshot) {
      setViolationSnapshots(prev => [
        { 
          type, 
          timestamp: new Date().toLocaleTimeString(), 
          image: screenshot 
        },
        ...prev
      ].slice(0, 10));
    }
  }, [videoRef]);


  const handleViolation = useCallback((type: string, detail: string) => {
    const flags = getFeatureFlags();
    if (!flags.enableProctoring) {
      console.log(`[PROCTORING BYPASSED] Violation: ${type} - ${detail}`);
      return;
    }

    // Capture screenshot of violation
    let screenshot: string | null = null;
    try {
      if (videoRef.current && videoRef.current.readyState === 4) {
        const video = videoRef.current;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
          screenshot = tempCanvas.toDataURL('image/jpeg', 0.6);
        }
      }
    } catch (e) {
      console.warn("Failed to capture violation snapshot:", e);
    }

    if (screenshot) {
      setViolationSnapshots(prev => [
        { type, timestamp: new Date().toLocaleTimeString(), image: screenshot },
        ...prev
      ].slice(0, 10)); // Keep last 10 snapshots
    }

    setWarnings(prev => {
      const newCount = prev + 1;
      setLastWarning(`${type}: ${detail}`);
      
      socket.emitWarning(type, detail);

      // Log the warning threshold reach/exceed to the server, but do not terminate the session.
      if (newCount === maxWarnings) {
        socket.emitViolation('Warning Limit Reached', 'Candidate has reached the warning threshold limit');
      } else if (newCount > maxWarnings) {
        socket.emitViolation('Warning Limit Exceeded', `Candidate has exceeded warning limit. Current warnings: ${newCount}`);
      }
      return newCount;
    });
  }, [socket, onTerminate, videoRef]);

  const flags = getFeatureFlags();
  const { startMonitoring, stopMonitoring } = useFaceDetection(videoRef, handleViolation, undefined);
  useAudioMonitor(stream, handleViolation, undefined);
  const { startRecording, stopRecording } = useRecording(stream);


  useEffect(() => {
    if (!socket.duplicateSessionNotice) return;

    setLastWarning(`Duplicate Session: ${socket.duplicateSessionNotice.detail}`);
    setWarnings(prev => Math.max(prev, 1));
  }, [socket.duplicateSessionNotice]);

  useEffect(() => {
    (window as any).addStartupLog?.("Proctoring started");
    (window as any).addStartupLog?.("Webcam initialization started");
    startWebcam().then((s) => {
      if (s) {
        startRecording();
        if (flags.enableProctoring) {
          startMonitoring();
        } else {
          console.warn('Proctoring is disabled by feature flag; face/audio monitoring will not start.');
        }
      }
    });

    const fullscreenTimeout = setTimeout(() => {
      if (!document.fullscreenElement && !fullscreenStartWarningSentRef.current) {
        fullscreenStartWarningSentRef.current = true;
        handleViolation('Fullscreen Required', 'Interview started without fullscreen mode enabled');
      }
    }, 1500);

    // Enforcement: Fullscreen
    const handleFullscreenChange = () => {
      const activeFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(activeFullscreen);
      if (!activeFullscreen) {
        handleViolation('Fullscreen Exited', 'Test must be taken in fullscreen mode');
        // Auto-recovery: attempt to re-enter fullscreen
        document.documentElement.requestFullscreen().catch(() => {});
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

    // Enforcement: Right-Click blocking
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      handleViolation('Right-Click Attempted', 'Right-clicking is strictly prohibited during the assessment.');
    };

    // Enforcement: Text Selection prevention
    const handleSelectStart = (e: Event) => {
      e.preventDefault();
    };

    // Enforcement: Keyboard Shortcuts restrictions
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrlOrCmd = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // F12 key
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        handleViolation('Keyboard Violation', 'Accessing Developer Tools (F12) is forbidden.');
        return;
      }

      // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
      if (ctrlOrCmd && shift && (e.key === 'I' || e.key === 'J' || e.key === 'C' || e.key === 'i' || e.key === 'j' || e.key === 'c' || e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
        e.preventDefault();
        handleViolation('Keyboard Violation', 'Opening Developer Tools is forbidden.');
        return;
      }

      // Ctrl+U (View Source)
      if (ctrlOrCmd && (e.key === 'u' || e.key === 'U' || e.keyCode === 85)) {
        e.preventDefault();
        handleViolation('Keyboard Violation', 'Viewing page source is forbidden.');
        return;
      }

      // Ctrl+S (Save)
      if (ctrlOrCmd && (e.key === 's' || e.key === 'S' || e.keyCode === 83)) {
        e.preventDefault();
        handleViolation('Keyboard Violation', 'Saving the page is forbidden.');
        return;
      }

      // Ctrl+P (Print)
      if (ctrlOrCmd && (e.key === 'p' || e.key === 'P' || e.keyCode === 80)) {
        e.preventDefault();
        handleViolation('Keyboard Violation', 'Printing the page is forbidden.');
        return;
      }

      // Ctrl+C (Copy)
      if (ctrlOrCmd && (e.key === 'c' || e.key === 'C' || e.keyCode === 67)) {
        e.preventDefault();
        handleViolation('Keyboard Violation', 'Copying content is forbidden.');
        return;
      }

      // Ctrl+V (Paste)
      if (ctrlOrCmd && (e.key === 'v' || e.key === 'V' || e.keyCode === 86)) {
        e.preventDefault();
        handleViolation('Keyboard Violation', 'Pasting content is forbidden.');
        return;
      }
    };

    // Enforcement: Print blocking
    const handleBeforePrint = () => {
      handleViolation('Print Attempted', 'Printing is strictly prohibited.');
    };

    // Periodic DevTools checks (Dimension check + Debugger delay)
    const checkDevTools = () => {
      // 1. Dimension Check: Panel docked check (threshold: 160px difference)
      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 160;
      
      if (document.fullscreenElement && (widthThreshold || heightThreshold)) {
        handleViolation('DevTools Detected', 'Developer Tools panel is open.');
      }

      // 2. Debugger timing check
      const start = performance.now();
      // debugger statement removed for CI safety
      const end = performance.now();
      if (end - start > 100) {
        handleViolation('DevTools Detected', 'Debugger execution delay detected.');
      }
    };

    // Apply text selection prevention style to body
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('copy', handleCopyPaste);
    document.addEventListener('paste', handleCopyPaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('selectstart', handleSelectStart);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('beforeprint', handleBeforePrint);

    // Apply print-blocking style tag dynamically
    const printStyle = document.createElement('style');
    printStyle.id = 'assessment-anti-print';
    printStyle.textContent = '@media print { body { display: none !important; } }';
    document.head.appendChild(printStyle);

    // Enforcement: Multiple Displays
    const checkMultipleDisplays = async () => {
      try {
        if ('getScreenDetails' in window || 'isExtended' in window.screen) {
          if ((window.screen as any).isExtended) {
            handleViolation('Multiple Displays', 'Additional display devices detected. Only one monitor is allowed.');
          }
        } else {
          if (window.screen.width > 2560 && window.screen.width > window.screen.availWidth * 1.5) {
             handleViolation('Multiple Displays', 'Suspicious screen configuration detected. Possible secondary monitor.');
          }
        }
      } catch (err) {
        console.warn('Failed to check display details:', err);
      }
    };

    // Enforcement: Remote Access Detection & Headless Browser check
    const checkRemoteAccess = () => {
      if (navigator.webdriver) {
        handleViolation('Remote Access/Automation', 'Automation or remote control tool detected via WebDriver.');
      }

      const suspiciousAgents = ['HeadlessChrome', 'Cypress', 'Selenium', 'Puppeteer', 'Playwright'];
      if (suspiciousAgents.some(agent => navigator.userAgent.includes(agent))) {
        handleViolation('Remote Access/Automation', 'Unauthorized browser environment detected.');
      }

      const automationProps = [
        '__webdriver_evaluate',
        '__selenium_evaluate',
        '__webdriver_script_function',
        '__webdriver_script_func',
        '__webdriver_script_fn',
        '__fxdriver_evaluate',
        '__driver_unwrapped',
        '__webdriver_unwrapped',
        '__selenium_unwrapped',
        '__fxdriver_unwrapped',
        '_Selenium_IDE_Recorder',
        '_phantom',
        'callPhantom'
      ];
      automationProps.forEach(prop => {
        if (prop in window) {
          handleViolation('Remote Access/Automation', `Suspicious browser automation variable detected: ${prop}`);
        }
      });

      if (navigator.languages && navigator.languages.length === 0) {
        handleViolation('Remote Access/Automation', 'Headless browser fingerprint detected (missing language preference).');
      }

      if (navigator.plugins && navigator.plugins.length === 0 && navigator.userAgent.includes('Chrome')) {
        handleViolation('Remote Access/Automation', 'Headless browser fingerprint detected (missing browser plugins).');
      }
    };

    // Initial checks
    checkMultipleDisplays();
    checkRemoteAccess();

    // Periodic checks
    displayCheckIntervalRef.current = window.setInterval(checkMultipleDisplays, 10000); // Every 10s
    remoteAccessCheckIntervalRef.current = window.setInterval(checkRemoteAccess, 15000); // Every 15s
    devToolsCheckIntervalRef.current = window.setInterval(checkDevTools, 5000); // Every 5s

    // Add listener for screen change if supported
    if ('screen' in window && 'onchange' in (window.screen as any)) {
      (window.screen as any).addEventListener('change', checkMultipleDisplays);
    }

    return () => {
      clearTimeout(fullscreenTimeout);
      stopWebcam();
      stopMonitoring();
      stopRecording();
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('copy', handleCopyPaste);
      document.removeEventListener('paste', handleCopyPaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('selectstart', handleSelectStart);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('beforeprint', handleBeforePrint);
      
      const antiPrintTag = document.getElementById('assessment-anti-print');
      if (antiPrintTag) antiPrintTag.remove();
      
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      
      if (displayCheckIntervalRef.current) clearInterval(displayCheckIntervalRef.current);
      if (remoteAccessCheckIntervalRef.current) clearInterval(remoteAccessCheckIntervalRef.current);
      if (devToolsCheckIntervalRef.current) clearInterval(devToolsCheckIntervalRef.current);
      if ('screen' in window && 'onchange' in (window.screen as any)) {
        (window.screen as any).removeEventListener('change', checkMultipleDisplays);
      }
    };
  }, []);

  // Continuous Identity Matching Effect
  useEffect(() => {
    const flags = getFeatureFlags();
    if (!flags.enableIdentityMatching) {
      console.log("Proctoring: Continuous identity matching is disabled via feature flags.");
      return;
    }

    if (!referenceEmbedding || referenceEmbedding.length === 0 || !videoRef.current || cameraError) return;

    let active = true;
    const checkIdentity = async () => {
      if (!active || !videoRef.current || videoRef.current.readyState !== 4) return;

      try {
        const res = await validateFrame(videoRef.current);
        if (!active) return;

        if (res.isValid && res.embedding) {
          const similarity = compareEmbeddings(res.embedding, referenceEmbedding);
          setIdentitySimilarity(similarity);

          if (similarity < 0.65) {
            setMismatchStreak(prev => {
              const next = prev + 1;
              console.warn(`Identity Match Mismatch! Streak = ${next}, similarity = ${similarity}`);

              if (next === 2) {
                toast.warning("Identity Warning: The camera does not recognize your face. Please face the camera directly.");
                logIdentityViolation(similarity, "Face Mismatch (Warning)");
              } else if (next === 4) {
                setIdentityWarningActive(true);
                logIdentityViolation(similarity, "Face Mismatch (Persistent)");
              } else if (next >= 6) {
                // Trigger formal violation
                handleViolation('Identity Swap Detected', `Candidate face does not match the pre-interview selfie reference (similarity: ${(similarity * 100).toFixed(0)}%).`);
                setIdentityWarningActive(false);
                return 0; // Reset streak
              }
              return next;
            });
          } else {
            // Reset mismatch streak since the face matches
            setMismatchStreak(0);
            setIdentityWarningActive(false);
          }
        }
      } catch (err) {
        console.warn("Continuous identity check error:", err);
      }
    };

    const interval = setInterval(checkIdentity, 3000); // check every 3 seconds
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [referenceEmbedding, validateFrame, compareEmbeddings, handleViolation, logIdentityViolation, cameraError]);

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
    <>
      {identityWarningActive && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-xl px-4 pointer-events-auto animate-bounce">
          <Alert variant="destructive" className="border-red-500 bg-red-950/95 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)] backdrop-blur-md">
            <ShieldAlert className="h-5 w-5 text-red-500 shrink-0" />
            <div>
              <AlertTitle className="font-bold text-red-400">IDENTITY MISMATCH WARNING</AlertTitle>
              <AlertDescription className="text-xs leading-5">
                The camera does not recognize your face. Please face the camera directly, ensure proper lighting, and remove any obstructions. The interview will be terminated automatically if this mismatch continues.
              </AlertDescription>
            </div>
          </Alert>
        </div>
      )}

      <div className="fixed top-4 right-4 z-50 flex flex-col gap-4 w-64 pointer-events-none">
        {socket.duplicateSessionNotice?.blocked && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-6 pointer-events-auto">
            <Alert variant="destructive" className="max-w-lg border-red-500 bg-red-950/90 text-white shadow-2xl">
              <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Examination already active</AlertTitle>
            <AlertDescription className="text-sm leading-6">
              This examination link is already open in another active browser tab or session. This tab has been blocked and the interviewer has been notified.
            </AlertDescription>
          </Alert>
        </div>
      )}

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
          <AlertTitle>
            {warnings >= maxWarnings 
              ? `Warnings Exceeded: ${warnings}` 
              : `Warning ${warnings}/${maxWarnings}`}
          </AlertTitle>
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
    </>
  );
};

class ProctoringErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ProctoringErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-950/20 border border-red-500/30 rounded-2xl text-center max-w-md mx-auto space-y-4">
          <div className="mx-auto w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center border border-red-500/30">
            <ShieldAlert className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-red-400 font-bold text-lg">Proctoring Core Failure</h3>
          <p className="text-sm text-slate-300">
            A background proctoring thread failed. This may happen if the machine runs out of memory or if WebGL context was lost.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2 rounded-xl text-xs"
            >
              Restart Proctoring
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const MemoizedProctoring = React.memo(Proctoring);

const ProctoringWithBoundary = (props: ProctoringProps) => {
  return (
    <ProctoringErrorBoundary>
      <MemoizedProctoring {...props} />
    </ProctoringErrorBoundary>
  );
};

export default ProctoringWithBoundary;
