import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';

let detector: faceDetection.FaceDetector | null = null;
let cocoModel: any = null;

const initModels = async () => {
  try {
    console.debug("[Proctoring Worker] Initializing TensorFlow inside Web Worker...");
    await tf.setBackend('cpu'); // CPU is extremely stable inside Web Workers
    await tf.ready();
    
    console.debug("[Proctoring Worker] Loading MediaPipe FaceDetector Singleton in worker...");
    detector = await faceDetection.createDetector(
      faceDetection.SupportedModels.MediaPipeFaceDetector,
      { runtime: 'tfjs', maxFaces: 3 }
    );

    console.debug("[Proctoring Worker] Loading COCO-SSD in worker...");
    const { load } = await import('@tensorflow-models/coco-ssd');
    cocoModel = await load();

    console.debug("[Proctoring Worker] All models initialized inside Worker successfully.");
    postMessage({ type: 'ready' });
  } catch (err) {
    console.error("[Proctoring Worker] Failed to initialize models inside worker:", err);
    postMessage({ type: 'error', error: String(err) });
  }
};

onmessage = async (e) => {
  const { type } = e.data;

  if (type === 'init') {
    void initModels();
    return;
  }

  if (type === 'inference') {
    const { imageBitmap, shouldRunCoco, now } = e.data;
    if (!detector) {
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close();
      }
      return;
    }

    let faces: any[] = [];
    let cocoPersonCount = 0;
    let isPhoneDetected = false;

    tf.engine().startScope();
    try {
      if (shouldRunCoco && cocoModel) {
        const predictions = await cocoModel.detect(imageBitmap);
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
      } else {
        faces = await detector.estimateFaces(imageBitmap);
      }
    } catch (err) {
      console.error("[Proctoring Worker] Inference execution error:", err);
    } finally {
      tf.engine().endScope();
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        imageBitmap.close(); // Clean up graphics memory instantly (Fix 4)
      }
    }

    postMessage({
      type: 'inference_result',
      faces,
      cocoPersonCount,
      isPhoneDetected,
      shouldRunCoco,
      now
    });
  }
};
