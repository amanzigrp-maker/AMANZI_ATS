import { useEffect, useRef, useState } from 'react';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs';
import * as tf from '@tensorflow/tfjs';
import { getFeatureFlags } from '../utils/featureFlags';
import ProctoringWorker from './proctoring.worker?worker';



// ==========================================
// MANDATORY SINGLETONS & GLOBAL STATE (Fix 3)
// ==========================================
let cachedDetectorPromise: Promise<faceDetection.FaceDetector | null> | null = null;
let cachedDetector: faceDetection.FaceDetector | null = null;

let cachedCocoPromise: Promise<any> | null = null;
let cachedCocoModel: any = null;

let globalActiveLoopCount = 0;

export const useFaceDetection = (
  videoRef: React.RefObject<HTMLVideoElement>,
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
  console.log("useFaceDetection.ts: mounted (diagnostics)");

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [loopStatus, setLoopStatus] = useState<'Initializing' | 'Active' | 'Stopped'>('Initializing');

  // Mutex loop guards (Fix 7)
  const isRunningRef = useRef(false);
  const lastDetectTime = useRef<number>(performance.now());
  const lastCocoTime = useRef<number>(0);
  const lastWatchdogTime = useRef<number>(performance.now());
  const fpsRef = useRef<number>(5.0);
  const dynamicDelayRef = useRef<number>(200); // 200ms = 5 FPS target

  // Web Worker states (Fix 10)
  const workerRef = useRef<Worker | null>(null);
  const isWorkerReadyRef = useRef<boolean>(false);

  // Time-based stabilization refs (timestamps when violations start)
  const multipleFacesStart = useRef<number | null>(null);
  const noFaceStart = useRef<number | null>(null);
  const gazeStart = useRef<number | null>(null);
  const obstructionStart = useRef<number | null>(null);
  const frozenStart = useRef<number | null>(null);
  const phoneStart = useRef<number | null>(null);

  // Buffer for smoothing confidence scores
  const confidenceBuffer = useRef<number[]>([]);
  const confidenceBufferLimit = 5;

  // Offscreen canvas for pixel and inference downscaling
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inferenceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevFrameData = useRef<Uint8ClampedArray | null>(null);

  // Keep callback refs updated to avoid re-initializing the loop on callback change
  const onViolationRef = useRef(onViolation);
  const onDebugUpdateRef = useRef(onDebugUpdate);
  useEffect(() => {
    onViolationRef.current = onViolation;
    onDebugUpdateRef.current = onDebugUpdate;
  }, [onViolation, onDebugUpdate]);

  // Track last dispatched debug metrics to prevent duplicate re-renders (Fix 6)
  const lastDebugMetricsRef = useRef<string>("");

  // ==========================================
  // SINGLETON MODEL LOADERS FOR FALLBACK (Fix 3)
  // ==========================================
  const loadModelsMainThread = async () => {
    try {
      console.debug("[FaceDetector Hook] Running MAIN-THREAD FALLBACK. Initializing local singletons...");
      
      // Initialize WebGL GPU stabilization flags (Fix 3)
      tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0);
      tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
      
      await tf.setBackend('webgl');
      await tf.ready();
      console.log("[FaceDetector Hook] Local TensorFlow backend initialized:", tf.getBackend());

      if (!cachedDetector && !cachedDetectorPromise) {
        cachedDetectorPromise = (async () => {
          try {
            const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
            const detectorConfig: faceDetection.MediaPipeFaceDetectorTfjsModelConfig = {
              runtime: 'tfjs',
              maxFaces: 3,
            };
            await new Promise(resolve => setTimeout(resolve, 0));
            return await faceDetection.createDetector(model, detectorConfig);
          } catch (err) {
            console.error("Local face detector load failed:", err);
            return null;
          }
        })();
      }

      if (cachedDetectorPromise) {
        cachedDetector = await cachedDetectorPromise;
      }

      if (!cachedCocoModel && !cachedCocoPromise) {
        cachedCocoPromise = (async () => {
          try {
            const { load } = await import('@tensorflow-models/coco-ssd');
            await new Promise(resolve => setTimeout(resolve, 0));
            return await load();
          } catch (err) {
            console.error("Local COCO-SSD load failed:", err);
            return null;
          }
        })();
      }

      if (cachedCocoPromise) {
        cachedCocoModel = await cachedCocoPromise;
      }

      setLoopStatus('Stopped');
      console.log("[FaceDetector Hook] Local fallback singletons successfully loaded.");
    } catch (err) {
      console.error("[FaceDetector Hook] Local main thread fallback loader crashed:", err);
    }
  };

  // ==========================================
  // SPAWN BACKGROUND WEB WORKER (Fix 10)
  // ==========================================
  useEffect(() => {
    // Try to load Web Worker first, fallback to main thread if fails
    try {
      console.debug("[FaceDetector Hook] Spawning background proctoring Web Worker thread...");
      const worker = new ProctoringWorker();
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const { type } = e.data;
        if (type === 'ready') {
          console.log("[FaceDetector Hook] Web Worker successfully loaded and signaled READY.");
          isWorkerReadyRef.current = true;
          setLoopStatus('Stopped');
        } else if (type === 'error') {
          console.error("[FaceDetector Hook] Web Worker initialization error. Triggering main-thread fallback:", e.data.error);
          isWorkerReadyRef.current = false;
          void loadModelsMainThread();
        } else if (type === 'inference_result') {
          handleInferenceResult(e.data);
        }
      };

      worker.postMessage({ type: 'init' });
    } catch (err) {
      console.warn("[FaceDetector Hook] Failed to spawn Web Worker. Falling back to local main thread execution:", err);
      isWorkerReadyRef.current = false;
      void loadModelsMainThread();
    }

    // Set up emergency watchdog timer (Fix 7)
    const watchdogInterval = setInterval(() => {
      console.log("[Proctoring Watchdog] Renderer process is alive and active.", performance.now());
    }, 1000);

    return () => {
      console.log("useFaceDetection.ts: unmounted (diagnostics)");
      clearInterval(watchdogInterval);
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // ==========================================
  // PROCESS INFERENCE RESULTS (Worker & Main)
  // ==========================================
  const handleInferenceResult = (data: {
    faces: faceDetection.Face[];
    cocoPersonCount: number;
    isPhoneDetected: boolean;
    shouldRunCoco: boolean;
    now: number;
  }) => {
    const { faces, cocoPersonCount, isPhoneDetected, shouldRunCoco, now } = data;

    // Mutex release (Fix 7)
    isRunningRef.current = false;

    // Calculate inference loop FPS
    const timeDiff = now - lastDetectTime.current;
    lastDetectTime.current = now;
    fpsRef.current = 1000 / timeDiff;

    const getFaceScore = (f: any) => f.box?.score ?? f.score ?? 0;

    const faceCount = faces.filter(f => getFaceScore(f) >= 0.35).length;
    const totalPersons = shouldRunCoco ? Math.max(faceCount, cocoPersonCount) : faceCount;

    const currentMaxConfidence = faceCount > 0 ? Math.max(...faces.filter(f => getFaceScore(f) >= 0.35).map(f => getFaceScore(f))) : 0;
    confidenceBuffer.current.push(currentMaxConfidence);
    if (confidenceBuffer.current.length > confidenceBufferLimit) {
      confidenceBuffer.current.shift();
    }
    const avgConfidence = confidenceBuffer.current.reduce((a, b) => a + b, 0) / confidenceBuffer.current.length;

    // Gaze check
    let gazeDirection: 'Center' | 'Looking Away' | 'Unknown' = 'Unknown';
    if (faceCount === 1) {
      const face = faces.filter(f => getFaceScore(f) >= 0.35)[0];
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

    const currentTime = Date.now();

    // Check: Multiple Persons (2+ seconds threshold)
    if (totalPersons > 1) {
      if (multipleFacesStart.current === null) {
        multipleFacesStart.current = currentTime;
      } else if (currentTime - multipleFacesStart.current >= 2000) {
        onViolationRef.current('Multiple Faces Detected', `Multiple people (${totalPersons}) detected in the camera frame.`);
        multipleFacesStart.current = currentTime + 5000;
      }
    } else {
      multipleFacesStart.current = null;
    }

    // Check: No Person (5+ seconds threshold)
    if (totalPersons === 0) {
      if (noFaceStart.current === null) {
        noFaceStart.current = currentTime;
      } else if (currentTime - noFaceStart.current >= 5000) {
        onViolationRef.current('No Face Detected', 'No candidate visible in the camera frame.');
        noFaceStart.current = currentTime + 5000;
      }
    } else {
      noFaceStart.current = null;
    }

    // Check: Phone (1.5+ seconds threshold)
    if (isPhoneDetected) {
      if (phoneStart.current === null) {
        phoneStart.current = currentTime;
      } else if (currentTime - phoneStart.current >= 1500) {
        onViolationRef.current('Prohibited Object Detected', 'A mobile/cell phone was detected in the camera view.');
        phoneStart.current = currentTime + 8000;
      }
    } else {
      phoneStart.current = null;
    }

    // Check: Gaze direction (3+ seconds threshold)
    if (gazeDirection === 'Looking Away') {
      if (gazeStart.current === null) {
        gazeStart.current = currentTime;
      } else if (currentTime - gazeStart.current >= 3000) {
        onViolationRef.current('Suspicious Gaze/Head Turn', 'Candidate is repeatedly looking away from the screen');
        gazeStart.current = currentTime + 5000;
      }
    } else {
      gazeStart.current = null;
    }

    // Report to Debug Panel
    if (onDebugUpdateRef.current) {
      let tfMemory = null;
      try {
        const mem = tf.memory();
        tfMemory = { numTensors: mem.numTensors, numBytes: mem.numBytes };
      } catch (err) {
        // tf may not be active
      }

      const metrics = {
        faceCount: totalPersons,
        detectionConfidence: avgConfidence,
        fps: fpsRef.current,
        gazeStatus: gazeDirection,
        obstructionStatus: 'Clear' as const,
        loopStatus: 'Active' as const,
        tfMemory
      };

      const metricString = `${metrics.faceCount}-${metrics.gazeStatus}-${metrics.obstructionStatus}`;
      if (lastDebugMetricsRef.current !== metricString) {
        lastDebugMetricsRef.current = metricString;
        onDebugUpdateRef.current(metrics);
      }
    }

    // Throttled profiler logs: max once every 10 seconds (Fix 7 & 11)
    if (now - lastWatchdogTime.current >= 10000) {
      lastWatchdogTime.current = now;
      let tfMem = { numTensors: 0, numBytes: 0 };
      try {
        const m = tf.memory();
        tfMem = { numTensors: m.numTensors, numBytes: m.numBytes };
      } catch (e) {}
      console.log(
        `📊 [Proctoring Profiler Log] active_loops: ${globalActiveLoopCount} | ` +
        `loop_fps: ${fpsRef.current.toFixed(1)} | ` +
        `worker_active: ${isWorkerReadyRef.current} | ` +
        `tensors: ${tfMem.numTensors} | ` +
        `memory: ${(tfMem.numBytes / 1024 / 1024).toFixed(2)} MB`
      );
    }
  };

  // ==========================================
  // MAIN THREAD LOCAL INFERENCE FALLBACK
  // ==========================================
  const runLocalInference = async (canvas: HTMLCanvasElement, shouldRunCoco: boolean, now: number) => {
    let faces: faceDetection.Face[] = [];
    let cocoPersonCount = 0;
    let isPhoneDetected = false;

    // GPU / Memory safety scope (Fix 4)
    tf.engine().startScope();
    try {
      if (shouldRunCoco && cachedCocoModel) {
        const predictions = await cachedCocoModel.detect(canvas);
        const personPredictions = predictions.filter(
          (p: any) => p.class === 'person' && p.score >= 0.45
        );
        cocoPersonCount = personPredictions.length;
        const phonePrediction = predictions.find(
          (p: any) => (p.class === 'cell phone' || p.class === 'phone') && p.score >= 0.5
        );
        if (phonePrediction) {
          isPhoneDetected = true;
        }
      } else if (cachedDetector) {
        faces = await cachedDetector.estimateFaces(canvas);
      }
    } catch (err) {
      console.error("[FaceDetector Local fallback] Inference failed:", err);
    } finally {
      tf.engine().endScope();
    }

    // Call result processor locally
    handleInferenceResult({
      faces,
      cocoPersonCount,
      isPhoneDetected,
      shouldRunCoco,
      now
    });
  };

  // ==========================================
  // SINGLE CENTRALIZED requestAnimationFrame PUMP (Fix 2 & 6)
  // ==========================================
  useEffect(() => {
    if (!isMonitoring) {
      setLoopStatus((isWorkerReadyRef.current || cachedDetector) ? 'Stopped' : 'Initializing');
      return;
    }

    let active = true;
    let animationFrameId: number | null = null;
    globalActiveLoopCount++;

    const runLoop = async () => {
      if (!active) return;

      const now = performance.now();
      const timeDiff = now - lastDetectTime.current;

      // Throttle to dynamic delays (Fix 5 & 10)
      if (timeDiff >= dynamicDelayRef.current) {
        // Mutex Guard (Fix 2 & 7)
        if (!isRunningRef.current) {
          const video = videoRef.current;
          const readyState = video ? video.readyState : 0;
          const videoWidth = video ? video.videoWidth : 0;
          const videoHeight = video ? video.videoHeight : 0;

          if (video && readyState === 4 && videoWidth > 0 && videoHeight > 0) {
            isRunningRef.current = true;

            // Prepare downscaled canvas (Fix 6)
            if (!inferenceCanvasRef.current) {
              inferenceCanvasRef.current = document.createElement("canvas");
            }
            const canvas = inferenceCanvasRef.current;
            canvas.width = 256;
            canvas.height = 192;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(video, 0, 0, 256, 192);
            }

            // Decide model execution (staggered to prevent double runs) (Fix 6)
            const timeSinceLastCoco = now - lastCocoTime.current;
            const shouldRunCoco = timeSinceLastCoco >= 3000 && fpsRef.current >= 15;
            if (shouldRunCoco) {
              lastCocoTime.current = now;
            }

            if (isWorkerReadyRef.current && workerRef.current) {
              // Web Worker Transferable ImageBitmap Offloading (Fix 10)
              try {
                const imageBitmap = await createImageBitmap(canvas);
                workerRef.current.postMessage({
                  type: 'inference',
                  imageBitmap,
                  shouldRunCoco,
                  now
                }, [imageBitmap]); // Transfer ImageBitmap ownership (Fix 4 & 10)
              } catch (bitmapErr) {
                console.error("[FaceDetector Hook] Failed to create ImageBitmap for worker. Running local fallback:", bitmapErr);
                await runLocalInference(canvas, shouldRunCoco, now);
              }
            } else {
              // Local fallback mode
              await runLocalInference(canvas, shouldRunCoco, now);
            }
          }
        }
      }

      if (active) {
        animationFrameId = requestAnimationFrame(runLoop);
      }
    };

    animationFrameId = requestAnimationFrame(runLoop);

    return () => {
      active = false;
      globalActiveLoopCount = Math.max(0, globalActiveLoopCount - 1);
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isMonitoring]);

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
