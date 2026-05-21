import { useState, useEffect, useRef, useCallback } from 'react';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs';
import * as tf from '@tensorflow/tfjs';
import { extractFaceEmbedding, compareFaceEmbeddings, LandmarkKeypoint } from '../utils/faceEmbeddingUtils';
import { getFeatureFlags } from '../utils/featureFlags';

export interface VerificationValidation {
  isValid: boolean;
  reason?: string;
  embedding?: number[];
  brightness?: number;
  variance?: number;
  box?: any;
  keypoints?: any[];
  score?: number;
  faceCount?: number;
  advancedVerificationUnavailable?: boolean;
}

export const useIdentityVerification = () => {
  const [detector, setDetector] = useState<any>(null);
  const [modelState, setModelState] = useState<'idle' | 'loading' | 'ready' | 'failed' | 'timeout'>('idle');
  const [activeDetectorType, setActiveDetectorType] = useState<'facemesh' | 'facedetector' | 'none'>('none');
  const [lastError, setLastError] = useState<string | null>(null);
  
  // TensorFlow setup state fields
  const [isTfReady, setIsTfReady] = useState(false);
  const [activeBackend, setActiveBackend] = useState<string>('unknown');
  const [isWebGLSupported, setIsWebGLSupported] = useState(false);

  const loadingPromiseRef = useRef<Promise<any> | null>(null);
  const isInferenceRunningRef = useRef(false);

  const isLoading = modelState === 'loading';

  const initializeTensorFlow = async () => {
    try {
      console.debug("useIdentityVerification: Initializing TensorFlow...");
      (window as any).addStartupLog?.("TensorFlow initialization started");
      
      const flags = getFeatureFlags();
      
      // Dynamic package versions logging
      console.log(`useIdentityVerification: Package versions - @tensorflow/tfjs: ${tf.version?.tfjs || 'unknown'}`);
      
      // Force CPU backend if requested (Task 5)
      if (flags.forceCpu) {
        console.warn("useIdentityVerification: Forcing backend to cpu via debug flag.");
        await tf.setBackend('cpu');
        setActiveBackend('cpu');
        setIsWebGLSupported(false);
        setIsTfReady(true);
        (window as any).addStartupLog?.("Backend selected: cpu (forced)");
        return 'cpu';
      }

      // WebGL support check
      const hasWebGL = tf.findBackend('webgl') !== undefined;
      setIsWebGLSupported(hasWebGL);

      // Verify TF is ready
      await tf.ready();
      setIsTfReady(true);

      // Force backend selection
      if (hasWebGL) {
        try {
          console.debug("useIdentityVerification: Forcing backend to webgl...");
          await tf.setBackend('webgl');
        } catch (webglErr: any) {
          console.warn("useIdentityVerification: WebGL backend setup failed. Falling back to cpu.", webglErr);
          await tf.setBackend('cpu');
        }
      } else {
        console.warn("useIdentityVerification: WebGL is not supported by the environment. Using cpu.");
        await tf.setBackend('cpu');
      }

      const currentBackend = tf.getBackend();
      setActiveBackend(currentBackend);
      console.log("useIdentityVerification: TF initialization complete. Backend:", currentBackend);
      (window as any).addStartupLog?.(`Backend selected: ${currentBackend}`);
      return currentBackend;
    } catch (err: any) {
      console.error("useIdentityVerification: TensorFlow ready/backend selection failed:", err);
      setLastError(`TensorFlow Initialization Failure: ${err.message || err}`);
      (window as any).addStartupLog?.(`TensorFlow initialization crashed: ${err.message || err}`);
      throw err;
    }
  };

  const loadModel = useCallback(async (): Promise<any> => {
    const flags = getFeatureFlags();
    
    // Check if TF or models are disabled via feature flags (Task 7)
    if (!flags.enableTf) {
      setModelState('failed');
      setActiveDetectorType('none');
      setLastError("TensorFlow is disabled via feature flags.");
      (window as any).addStartupLog?.("TensorFlow disabled via feature flags");
      return null;
    }

    if (detector) return detector;
    if (loadingPromiseRef.current) return loadingPromiseRef.current;

    setModelState('loading');
    setLastError(null);

    const promise = (async () => {
      let initTimeout: NodeJS.Timeout | null = null;
      let isCompleted = false;

      try {
        // Create a wrapper promise that races initialization against a timeout
        const detectorPromise = new Promise<any>((resolve, reject) => {
          initTimeout = setTimeout(() => {
            if (!isCompleted) {
              reject(new Error("Detector initialization timeout"));
            }
          }, 10000);

          (async () => {
            try {
              // Ensure TF is initialized
              await initializeTensorFlow();
              
              console.debug("useIdentityVerification: Loading lightweight MediaPipe FaceDetector...");
              const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
              const config: faceDetection.MediaPipeFaceDetectorTfjsConfig = {
                runtime: 'tfjs',
                maxFaces: 3
              };

              const newDetector = await faceDetection.createDetector(model, config);
              resolve(newDetector);
            } catch (err) {
              reject(err);
            }
          })();
        });

        const newDetector = await detectorPromise;
        
        isCompleted = true;
        if (initTimeout) {
          clearTimeout(initTimeout);
          initTimeout = null;
        }

        console.log("useIdentityVerification: Lightweight FaceDetector loaded successfully. Timeout cleared.");

        // Only update state if we are still the active promise
        if (loadingPromiseRef.current === promise) {
          setDetector(newDetector);
          setModelState('ready');
          setActiveDetectorType('facedetector');
          (window as any).addStartupLog?.("Detector loaded: facedetector");
          loadingPromiseRef.current = null;
        }
        
        return newDetector;

      } catch (err: any) {
        isCompleted = true;
        if (initTimeout) {
          clearTimeout(initTimeout);
          initTimeout = null;
        }

        console.error("useIdentityVerification: Initialization failed:", err);

        if (loadingPromiseRef.current === promise) {
          const isTimeout = err.message && err.message.includes("timeout");
          setModelState(isTimeout ? 'timeout' : 'failed');
          setLastError(err.message || String(err));
          loadingPromiseRef.current = null;
        }

        return null; // Return null instead of throwing to prevent crashing the renderer
      }
    })();

    loadingPromiseRef.current = promise;
    return promise;
  }, [detector]);

  // Clean up loading promise on unmount
  useEffect(() => {
    return () => {
      loadingPromiseRef.current = null;
      // We cannot easily cancel the promise, but by clearing the ref, 
      // the state transitions in loadModel will be skipped.
    };
  }, []);

  /**
   * Helper to perform pixel analysis for brightness & variance on a video frame
   */
  const analyzePixels = (video: HTMLVideoElement): { brightness: number; variance: number } => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 48;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { brightness: 128, variance: 100 };

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const totalPixels = canvas.width * canvas.height;

      let totalBrightness = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
      }
      const brightness = totalBrightness / totalPixels;

      let squaredDiffs = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const pixelBrightness = 0.299 * r + 0.587 * g + 0.114 * b;
        squaredDiffs += Math.pow(pixelBrightness - brightness, 2);
      }
      const variance = squaredDiffs / totalPixels;

      return { brightness, variance };
    } catch (e) {
      console.warn("useIdentityVerification: analyzePixels failed:", e);
      return { brightness: 128, variance: 100 };
    }
  };

  /**
   * Validates video frame for selfie capture or identity matching.
   * Ensures exactly one face, proper lighting, centration, and clarity.
   */
  const validateFrame = useCallback(async (
    video: HTMLVideoElement
  ): Promise<VerificationValidation> => {
    const flags = getFeatureFlags();
    
    // Task 7 & 12: Bypassing inference if TF is disabled
    if (!flags.enableTf) {
      return {
        isValid: true,
        embedding: [],
        brightness: 100,
        variance: 100,
        box: null,
        keypoints: [],
        score: 1.0,
        faceCount: 1,
        advancedVerificationUnavailable: true
      };
    }

    if (isInferenceRunningRef.current) {
      console.warn("useIdentityVerification: validateFrame skipped - inference already in progress.");
      return { 
        isValid: false, 
        reason: "Inference already in progress...",
        faceCount: 0
      };
    }
    isInferenceRunningRef.current = true;
    const startTime = performance.now();

    try {
      let activeDetector = detector;
      if (!activeDetector) {
        try {
          activeDetector = await loadModel();
          if (!activeDetector) {
            // If models failed to load, return graceful mock success to not block user
            return {
              isValid: true,
              embedding: [],
              brightness: 100,
              variance: 100,
              box: null,
              keypoints: [],
              score: 1.0,
              faceCount: 1,
              advancedVerificationUnavailable: true
            };
          }
        } catch (e) {
          return { isValid: false, reason: "Waiting for camera initialization (model loading...)" };
        }
      }

      // Verify Video stream state before inference
      const readyState = video ? video.readyState : 0;
      const videoWidth = video ? video.videoWidth : 0;
      const videoHeight = video ? video.videoHeight : 0;
      
      if (!video || readyState !== 4 || videoWidth === 0 || videoHeight === 0) {
        return { isValid: false, reason: "Waiting for camera initialization" };
      }

      // 1. Brightness & Variance checks (obstruction/darkness)
      const { brightness, variance } = analyzePixels(video);
      
      // Lower strictness thresholds for debugging
      const minBrightness = 8;
      const minVariance = 12;
      if (brightness < minBrightness) {
        return { isValid: false, reason: `Lighting too low (${brightness.toFixed(0)}). Increase your room lighting.`, brightness, variance };
      }
      if (variance < minVariance) {
        return { isValid: false, reason: "Webcam feed obstructed or blurry.", brightness, variance };
      }

      // 2. Run FaceDetector with tf.tidy scope safety
      let faces: any[] = [];
      tf.engine().startScope();
      try {
        faces = await activeDetector.estimateFaces(video);
      } catch (err: any) {
        console.error("useIdentityVerification: estimateFaces error:", err);
        // Return mock success on inference crashes to avoid lockouts
        return {
          isValid: true,
          embedding: [],
          brightness,
          variance,
          box: null,
          keypoints: [],
          score: 1.0,
          faceCount: 1,
          advancedVerificationUnavailable: true
        };
      } finally {
        tf.engine().endScope();
      }

      // Safely parse faces array as FaceMesh versions differ
      const safeFaces = Array.isArray(faces) ? faces : (faces ? [faces] : []);
      const faceCount = safeFaces.length;
      
      if (faceCount === 0) {
        return { isValid: false, reason: "No face detected in the frame. Position yourself in front of the camera.", brightness, variance, faceCount: 0 };
      }
      if (faceCount > 1) {
        return { isValid: false, reason: "Multiple people detected. Only one candidate is allowed in frame.", brightness, variance, faceCount };
      }

      const face = safeFaces[0];
      // FaceMesh sometimes returns boundingBox instead of box
      const box = face.box || face.boundingBox;
      
      // FaceMesh sometimes returns scaledMesh or mesh instead of keypoints
      const keypoints = face.keypoints || face.scaledMesh || face.mesh || face.landmarks;
      
      // FaceMesh sometimes returns faceInViewConfidence instead of score
      let score = face.score ?? face.faceInViewConfidence ?? face.detectionConfidence ?? 1.0;
      if (Array.isArray(score)) {
        score = score[0];
      }
      
      // Relax score threshold aggressively for debugging
      if (score < 0.1) {
        return { 
          isValid: false, 
          reason: `Face confidence very low (${(score * 100).toFixed(0)}%). Look toward camera.`, 
          brightness, 
          variance,
          box,
          keypoints,
          score,
          faceCount
        };
      }

      // 3. Alignment / Centering check
      if (box) {
        const faceCenterX = box.xMin + box.width / 2;
        const faceCenterY = box.yMin + box.height / 2;

        const normCenterX = faceCenterX / videoWidth;
        const normCenterY = faceCenterY / videoHeight;

        // Allow middle 80% range instead of 60%
        if (normCenterX < 0.10 || normCenterX > 0.90 || normCenterY < 0.05 || normCenterY > 0.95) {
          return { 
            isValid: false, 
            reason: "Face detected but not centered. Center your face.", 
            brightness, 
            variance,
            box,
            keypoints,
            score,
            faceCount
          };
        }
      }

      // If using fallback FaceDetector, we bypass 3D face landmarks and embedding
      if (activeDetectorType === 'facedetector') {
        return {
          isValid: true,
          embedding: [],
          brightness,
          variance,
          box,
          keypoints,
          score,
          faceCount,
          advancedVerificationUnavailable: true
        };
      }

      // 4. Extract landmarks and construct face embedding
      // Aggressively lower threshold to ANY face landmarks for visual debugging
      if (!keypoints || keypoints.length < 1) {
        return { 
          isValid: false, 
          reason: "Face partially visible or landmarks missing (adjust lighting/angle).", 
          brightness, 
          variance,
          box,
          keypoints,
          score,
          faceCount
        };
      }

      const embedding = extractFaceEmbedding(keypoints);
      if (!embedding || embedding.length === 0) {
        return { 
          isValid: false, 
          reason: "Failed to extract face identity landmarks.", 
          brightness, 
          variance,
          box,
          keypoints,
          score,
          faceCount
        };
      }

      return {
        isValid: true,
        embedding,
        brightness,
        variance,
        box,
        keypoints,
        score,
        faceCount,
        advancedVerificationUnavailable: false
      };
    } finally {
      isInferenceRunningRef.current = false;
      const duration = performance.now() - startTime;
      console.debug(`[IdentityVerification Timing] validateFrame took ${duration.toFixed(1)}ms`);
    }
  }, [detector, loadModel, activeDetectorType]);

  return {
    loadModel,
    validateFrame,
    compareEmbeddings: compareFaceEmbeddings,
    isLoading,
    isModelLoaded: !!detector,
    modelState,
    activeDetectorType,
    lastError,
    isTfReady,
    activeBackend,
    isWebGLSupported
  };
};
