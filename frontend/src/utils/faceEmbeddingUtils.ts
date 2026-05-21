export interface LandmarkKeypoint {
  x: number;
  y: number;
  z?: number;
  name?: string;
}

/**
 * Normalizes 3D landmarks from MediaPipe FaceMesh to be invariant to face scale,
 * translation, and in-plane rotation.
 * 
 * Anchor points used:
 * - Nose Tip (index 4): Coordinate center (0, 0, 0)
 * - Left Eye Inner Corner (index 133) and Right Eye Inner Corner (index 362)
 */
export function extractFaceEmbedding(landmarks: LandmarkKeypoint[]): number[] {
  if (!landmarks || landmarks.length < 363) {
    console.debug("extractFaceEmbedding: Insufficient face landmarks detected (need at least 363).");
    return [];
  }

  // 1. Center coordinates around the nose tip (index 4)
  const nose = landmarks[4];
  if (!nose) return [];

  const translated = landmarks.map(kp => ({
    x: kp.x - nose.x,
    y: kp.y - nose.y,
    z: (kp.z ?? 0) - (nose.z ?? 0)
  }));

  // 2. Scale by inner eye corner distance (left: 133, right: 362)
  const le = translated[133];
  const re = translated[362];
  if (!le || !re) return [];

  const eyeDist = Math.sqrt(
    Math.pow(re.x - le.x, 2) +
    Math.pow(re.y - le.y, 2) +
    Math.pow(re.z - le.z, 2)
  );

  if (eyeDist === 0) return [];

  // Scale coordinates
  const scaled = translated.map(kp => ({
    x: kp.x / eyeDist,
    y: kp.y / eyeDist,
    z: kp.z / eyeDist
  }));

  // 3. Align in-plane rotation (align inner eye corners horizontally)
  const nle = scaled[133];
  const nre = scaled[362];
  const dx = nre.x - nle.x;
  const dy = nre.y - nle.y;
  const angle = Math.atan2(dy, dx);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);

  // Apply rotation matrix
  const rotated = scaled.map(kp => ({
    x: kp.x * cos - kp.y * sin,
    y: kp.x * sin + kp.y * cos,
    z: kp.z
  }));

  // 4. Flatten coordinates to a 1D feature array (up to 468 landmarks)
  const embedding: number[] = [];
  const limit = Math.min(468, rotated.length);
  for (let i = 0; i < limit; i++) {
    embedding.push(rotated[i].x, rotated[i].y, rotated[i].z);
  }
  
  return embedding;
}

/**
 * Compares two normalized landmark vectors and calculates a similarity score between 0.0 and 1.0.
 * A similarity of 1.0 represents an identical geometric face, and 0.0 is a complete mismatch.
 */
export function compareFaceEmbeddings(emb1: number[], emb2: number[]): number {
  if (!emb1 || !emb2 || emb1.length === 0 || emb2.length === 0 || emb1.length !== emb2.length) {
    return 0;
  }

  // Calculate Root Mean Squared Error (RMSE) across 3D coordinates
  let sumSquaredDiff = 0;
  const totalCoords = emb1.length;
  
  for (let i = 0; i < totalCoords; i++) {
    sumSquaredDiff += Math.pow(emb1[i] - emb2[i], 2);
  }

  const numLandmarks = totalCoords / 3;
  const meanSquaredError = sumSquaredDiff / numLandmarks;
  const rmse = Math.sqrt(meanSquaredError);

  // Map RMSE to a similarity score (0.0 to 1.0)
  // Matching faces typically yield an RMSE < 0.08.
  // Mismatched faces typically yield an RMSE > 0.16.
  // Using 4.5 multiplier gives:
  // RMSE 0.04 -> Sim 0.82
  // RMSE 0.08 -> Sim 0.64
  // RMSE 0.16 -> Sim 0.28
  const similarity = Math.max(0, Math.min(1.0, 1.0 - rmse * 4.5));
  return similarity;
}
