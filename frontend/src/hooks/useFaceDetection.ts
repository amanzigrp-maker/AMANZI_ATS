import { useEffect, useRef, useState } from 'react';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs';
import * as tf from '@tensorflow/tfjs';
import { getFeatureFlags } from '../utils/featureFlags';

export const useFaceDetection = (
  videoRef: React.RefObject<HTMLVideoElement>,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  onViolation: (type: string, detail: string) => void,
  onDebugUpdate?: (metrics: {
    faceCount: number;
    detectionConfidence: number;
    fps: number;
    gazeStatus: 'Center' | 'Looking Away' | 'Unknown';
    obstructionStatus: 'Clear' | 'Obstructed' | 'Static' | 'Unknown';
    loopStatus: 'Initializing' | 'Active' | 'Stopped';
    tfMemory: { numTensors: number; numBytes: number } | null;
  }) => void
) => {
  const [detector, setDetector] = useState<faceDetection.FaceDetector | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [loopStatus, setLoopStatus] = useState<'Initializing' | 'Active' | 'Stopped'>('Initializing');

  // Loop management
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastDetectTime = useRef<number>(performance.now());
  const fpsRef = useRef<number>(0);

  // Time-based stabilization refs (timestamps when violations start)
  const multipleFacesStart = useRef<number | null>(null);
  const noFaceStart = useRef<number | null>(null);
  const gazeStart = useRef<number | null>(null);
  const obstructionStart = useRef<number | null>(null);
  const frozenStart = useRef<number | null>(null);

  // Buffer for smoothing confidence scores
  const confidenceBuffer = useRef<number[]>([]);
  const confidenceBufferLimit = 5;

  // Offscreen canvas for pixel analysis (brightness, variance, frame difference)
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevFrameData = useRef<Uint8ClampedArray | null>(null);

  // Stabilization: Callback refs to prevent loop recreation
  const onViolationRef = useRef(onViolation);
  const onDebugUpdateRef = useRef(onDebugUpdate);

  useEffect(() => {
    onViolationRef.current = onViolation;
    onDebugUpdateRef.current = onDebugUpdate;
  }, [onViolation, onDebugUpdate]);

  // Performance: Inference lock & active loop ID
  const isInferenceRunning = useRef(false);
  const activeLoopIdRef = useRef(0);

  useEffect(() => {
    const flags = getFeatureFlags();
    if (!flags.enableTf) {
      console.warn("useFaceDetection: TensorFlow is disabled. Skipping model load.");
      setLoopStatus('Stopped');
      return;
    }

    const loadModel = async () => {
      try {
        console.debug("useFaceDetection: Initializing MediaPipe Face Detector...");
        
        // Ensure TF is fully initialized and backend is set safely to prevent WebGL hangs
        await tf.ready();
        if (flags.forceCpu) {
          console.warn("useFaceDetection: Forcing backend to cpu via debug flag to prevent GPU hangs.");
          await tf.setBackend('cpu');
        }

        const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
        const detectorConfig: faceDetection.MediaPipeFaceDetectorTfjsConfig = {
          runtime: 'tfjs',
          maxFaces: 5,
        };
        const newDetector = await faceDetection.createDetector(model, detectorConfig);
        setDetector(newDetector);
        setLoopStatus('Stopped');
        console.debug("useFaceDetection: Model loaded successfully.");
      } catch (err) {
        console.error("useFaceDetection: Failed to load detector model:", err);
      }
    };
    loadModel();
  }, []);

  const detect = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const flags = getFeatureFlags();
    
    // Task 7 & 12: Bypassing inference if TF is disabled
    if (!flags.enableTf) {
      const now = performance.now();
      const timeDiff = now - lastDetectTime.current;
      lastDetectTime.current = now;
      if (timeDiff > 0) {
        const currentFps = 1000 / timeDiff;
        fpsRef.current = fpsRef.current * 0.9 + currentFps * 0.1;
      }

      if (onDebugUpdateRef.current) {
        onDebugUpdateRef.current({
          faceCount: 1,
          detectionConfidence: 1.0,
          fps: fpsRef.current,
          gazeStatus: 'Center',
          obstructionStatus: 'Clear',
          loopStatus: 'Active',
          tfMemory: null
        });
      }

      // Draw disabled notice on canvas
      if (canvas && video) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
          ctx.fillRect(10, 10, 240, 70);
          ctx.fillStyle = '#f59e0b';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(`AI proctoring bypass active`, 20, 30);
          ctx.fillStyle = '#ffffff';
          ctx.font = '11px sans-serif';
          ctx.fillText(`FPS: ${fpsRef.current.toFixed(1)}`, 20, 50);
          ctx.fillText(`Enhanced verification unavailable`, 20, 68);
        }
      }
      return;
    }

    const readyState = video ? video.readyState : 0;
    const videoWidth = video ? video.videoWidth : 0;
    const videoHeight = video ? video.videoHeight : 0;
    
    if (!detector || !video || readyState !== 4 || videoWidth === 0 || videoHeight === 0) {
      return;
    }

    // Inference locking
    if (isInferenceRunning.current) {
      console.warn("useFaceDetection: Inference skipped because previous run is still active.");
      return;
    }
    isInferenceRunning.current = true;

    // 1. Calculate FPS
    const now = performance.now();
    const timeDiff = now - lastDetectTime.current;
    lastDetectTime.current = now;
    if (timeDiff > 0) {
      const currentFps = 1000 / timeDiff;
      fpsRef.current = fpsRef.current * 0.9 + currentFps * 0.1;
    }

    // 2. Perform Face Detection with TensorFlow scope management to prevent leaks
    let faces: faceDetection.Face[] = [];
    const inferenceStartTime = performance.now();
    tf.engine().startScope();
    try {
      faces = await detector.estimateFaces(video);
    } catch (err) {
      console.error("useFaceDetection: Error estimating faces:", err);
    } finally {
      tf.engine().endScope();
      isInferenceRunning.current = false;
    }

    const inferenceDuration = performance.now() - inferenceStartTime;
    console.debug(`[FaceDetector Timing] FaceDetector inference took ${inferenceDuration.toFixed(1)}ms`);

    const rawFacesCount = faces.length;
    const rawConfidence = rawFacesCount > 0 ? (faces[0].score ?? 1.0) : 0;
    const rawLandmarksCount = rawFacesCount > 0 ? (faces[0].keypoints?.length ?? 0) : 0;
    console.debug(`[FaceDetector Detector Output] faces: ${rawFacesCount}, confidence: ${rawConfidence.toFixed(3)}, landmarks: ${rawLandmarksCount}`);

    // Filter faces based on relaxed confidence >= 0.35
    const validFaces = faces.filter(f => f.score >= 0.35);
    const faceCount = validFaces.length;

    // Track rolling confidence
    const currentMaxConfidence = faceCount > 0 ? Math.max(...validFaces.map(f => f.score)) : 0;
    confidenceBuffer.current.push(currentMaxConfidence);
    if (confidenceBuffer.current.length > confidenceBufferLimit) {
      confidenceBuffer.current.shift();
    }
    const avgConfidence = confidenceBuffer.current.reduce((a, b) => a + b, 0) / confidenceBuffer.current.length;

    // 3. Camera Obstruction & Frame Freeze Detection (Canvas Analysis)
    let avgBrightness = 128;
    let variance = 100;
    let frameDiff = 1.0;
    let isCovered = false;
    let isStatic = false;

    try {
      if (!offscreenCanvasRef.current) {
        offscreenCanvasRef.current = document.createElement('canvas');
      }
      const offscreen = offscreenCanvasRef.current;
      offscreen.width = 64;
      offscreen.height = 48;
      const ctx = offscreen.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
        const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
        const data = imgData.data;
        const totalPixels = offscreen.width * offscreen.height;

        // Brightness
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
        }
        avgBrightness = totalBrightness / totalPixels;

        // Variance
        let squaredDiffs = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
          squaredDiffs += Math.pow(brightness - avgBrightness, 2);
        }
        variance = squaredDiffs / totalPixels;

        // Frame Difference
        if (prevFrameData.current && prevFrameData.current.length === data.length) {
          let diffSum = 0;
          for (let i = 0; i < data.length; i += 4) {
            diffSum += Math.abs(data[i] - prevFrameData.current[i]) +
                       Math.abs(data[i+1] - prevFrameData.current[i+1]) +
                       Math.abs(data[i+2] - prevFrameData.current[i+2]);
          }
          frameDiff = (diffSum / 3) / totalPixels;
        }

        // Save current frame data
        if (!prevFrameData.current || prevFrameData.current.length !== data.length) {
          prevFrameData.current = new Uint8ClampedArray(data);
        } else {
          prevFrameData.current.set(data);
        }

        // Calibrate limits: Brightness < 15 or Variance < 25 (covered lens)
        isCovered = avgBrightness < 15 || variance < 25;
        // Frame difference < 0.05 indicates absolute static/frozen frame
        isStatic = prevFrameData.current !== null && frameDiff < 0.04;
      }
    } catch (e) {
      console.warn("useFaceDetection: Error running offscreen pixels analysis:", e);
    }

    // 4. Gaze Analysis (ratio-based nose vs eyes distance)
    let gazeDirection: 'Center' | 'Looking Away' | 'Unknown' = 'Unknown';
    if (faceCount === 1) {
      const face = validFaces[0];
      const keypoints = face.keypoints;
      if (keypoints && keypoints.length >= 3) {
        const getKp = (name: string, index: number) => {
          return keypoints.find((kp: any) => kp.name === name) || keypoints[index];
        };
        const le = getKp('leftEye', 1);
        const re = getKp('rightEye', 0);
        const nt = getKp('noseTip', 2);

        if (le && re && nt) {
          const midX = (le.x + re.x) / 2;
          const eyeDistance = Math.abs(re.x - le.x);
          if (eyeDistance > 0) {
            const offset = Math.abs(nt.x - midX);
            const ratio = offset / eyeDistance;
            gazeDirection = ratio > 0.25 ? 'Looking Away' : 'Center';
          }
        }
      }
    }

    // 5. Stabilization and Warn/Violation Logic
    const currentTime = Date.now();

    // -- Check: Multiple Faces (2+ seconds threshold)
    if (faceCount > 1) {
      if (multipleFacesStart.current === null) {
        multipleFacesStart.current = currentTime;
      } else if (currentTime - multipleFacesStart.current >= 2000) {
        onViolationRef.current('Multiple Faces Detected', `${faceCount} faces detected in frame`);
        multipleFacesStart.current = currentTime + 5000; // Cooldown
      }
    } else {
      multipleFacesStart.current = null;
    }

    // -- Check: No Face (5+ seconds threshold)
    if (faceCount === 0) {
      if (noFaceStart.current === null) {
        noFaceStart.current = currentTime;
      } else if (currentTime - noFaceStart.current >= 5000) {
        onViolationRef.current('No Face Detected', 'Candidate face not visible for > 5 seconds');
        noFaceStart.current = currentTime + 5000; // Cooldown
      }
    } else {
      noFaceStart.current = null;
    }

    // -- Check: Gaze direction (3+ seconds threshold)
    if (gazeDirection === 'Looking Away') {
      if (gazeStart.current === null) {
        gazeStart.current = currentTime;
      } else if (currentTime - gazeStart.current >= 3000) {
        onViolationRef.current('Suspicious Gaze/Head Turn', 'Candidate is repeatedly looking away from the screen');
        gazeStart.current = currentTime + 5000; // Cooldown
      }
    } else {
      gazeStart.current = null;
    }

    // -- Check: Obstruction / Covered (3+ seconds threshold)
    if (isCovered) {
      if (obstructionStart.current === null) {
        obstructionStart.current = currentTime;
      } else if (currentTime - obstructionStart.current >= 3000) {
        onViolationRef.current('Camera Obstructed', 'Webcam appears to be blocked, covered, or too dark');
        obstructionStart.current = currentTime + 5000; // Cooldown
      }
    } else {
      obstructionStart.current = null;
    }

    // -- Check: Frozen Frame (5+ seconds threshold)
    if (isStatic && !isCovered && faceCount > 0) {
      if (frozenStart.current === null) {
        frozenStart.current = currentTime;
      } else if (currentTime - frozenStart.current >= 5000) {
        onViolationRef.current('Camera Obstructed', 'Webcam feed is frozen or static');
        frozenStart.current = currentTime + 5000; // Cooldown
      }
    } else {
      frozenStart.current = null;
    }

    // 6. Visual Debugging Canvas Overlay Drawing
    if (canvas) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const width = canvas.width;
      const height = canvas.height;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, width, height);

        // Temporarily disable overlay drawing
        /*
        if (flags.enableLandmarkDrawing) {
          validFaces.forEach((face) => {
            const { xMin, yMin, width: boxWidth, height: boxHeight } = face.box;
            
            // Draw rectangle
            ctx.strokeStyle = faceCount > 1 ? '#ef4444' : '#22c55e';
            ctx.lineWidth = 3;
            ctx.strokeRect(xMin, yMin, boxWidth, boxHeight);

            // Draw score label
            ctx.fillStyle = faceCount > 1 ? '#ef4444' : '#22c55e';
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText(`Face: ${(face.score * 100).toFixed(0)}%`, xMin, yMin - 10);

            // Draw Landmarks (Keypoints)
            if (face.keypoints) {
              face.keypoints.forEach((kp) => {
                ctx.fillStyle = '#3b82f6';
                ctx.beginPath();
                ctx.arc(kp.x, kp.y, 4, 0, 2 * Math.PI);
                ctx.fill();
              });
            }
          });
        }
        */

        // Overlay status text in upper-left corner of canvas
        if (flags.enableDiagnosticsRendering) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
          ctx.fillRect(10, 10, 220, 120);

          ctx.fillStyle = '#ffffff';
          ctx.font = '12px sans-serif';
          ctx.fillText(`FPS: ${fpsRef.current.toFixed(1)}`, 20, 30);
          ctx.fillText(`Faces Detected: ${faceCount}`, 20, 50);
          ctx.fillText(`Gaze Status: ${gazeDirection}`, 20, 70);
          
          let obsText = 'Clear';
          if (isCovered) obsText = 'Covered/Obstruction';
          else if (isStatic) obsText = 'Frozen';
          ctx.fillText(`Camera Status: ${obsText}`, 20, 90);
          ctx.fillText(`Brightness/Var: ${avgBrightness.toFixed(0)} / ${variance.toFixed(0)}`, 20, 110);
        }
      }
    }

    // 7. Report to Debug Panel
    if (onDebugUpdateRef.current) {
      let tfMemory = null;
      try {
        const mem = tf.memory();
        tfMemory = { numTensors: mem.numTensors, numBytes: mem.numBytes };
      } catch (err) {
        // tf may not be ready or active
      }

      let obsStatus: 'Clear' | 'Obstructed' | 'Static' | 'Unknown' = 'Clear';
      if (isCovered) obsStatus = 'Obstructed';
      else if (isStatic) obsStatus = 'Static';

      onDebugUpdateRef.current({
        faceCount,
        detectionConfidence: avgConfidence,
        fps: fpsRef.current,
        gazeStatus: gazeDirection,
        obstructionStatus: obsStatus,
        loopStatus: 'Active',
        tfMemory
      });
    }
  };

  useEffect(() => {
    let active = true;
    const currentLoopId = ++activeLoopIdRef.current;
    const flags = getFeatureFlags();
    
    console.debug(`[FaceDetector Loop] Creating loop ID ${currentLoopId}. isMonitoring: ${isMonitoring}`);

    const detectLoop = async () => {
      if (currentLoopId !== activeLoopIdRef.current || !active) {
        console.debug(`[FaceDetector Loop] Stale loop ID ${currentLoopId} aborted.`);
        return;
      }
      
      setLoopStatus('Active');
      
      try {
        await detect();
      } catch (err) {
        console.error("useFaceDetection: Unhandled error in detect loop:", err);
      }
      
      if (isMonitoring && active && currentLoopId === activeLoopIdRef.current) {
        timeoutRef.current = setTimeout(detectLoop, 5000); // Throttled from 200ms
      }
    };

    if (isMonitoring) {
      // If TF is disabled, we run the loop anyway to feed mock statistics (Task 12)
      if (!flags.enableTf || detector) {
        detectLoop();
      }
    } else {
      setLoopStatus((detector || !flags.enableTf) ? 'Stopped' : 'Initializing');
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    return () => {
      active = false;
      // Invalidate current running cycle
      activeLoopIdRef.current++;
      console.debug(`[FaceDetector Loop] Cleaned up loop ID ${currentLoopId}`);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isMonitoring, detector]);

  return {
    startMonitoring: () => {
      console.debug("useFaceDetection: Starting face monitoring.");
      setIsMonitoring(true);
    },
    stopMonitoring: () => {
      console.debug("useFaceDetection: Stopping face monitoring.");
      setIsMonitoring(false);
    },
    loopStatus
  };
};
