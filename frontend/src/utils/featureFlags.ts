/**
 * Resolves feature flags and debug settings dynamically.
 * Combines Electron IPC-resolved environment flags with URL query parameter overrides.
 */
export interface FeatureFlags {
  enableTf: boolean;
  enableFaceMesh: boolean;
  enableProctoring: boolean;
  forceCpu: boolean;
  enableIdentityMatching: boolean;
  enableDiagnosticsRendering: boolean;
  enableLandmarkDrawing: boolean;
}

export const getFeatureFlags = (): FeatureFlags => {
  const params = new URLSearchParams(window.location.search);
  
  // Load from global state resolved on App mount, or default to true/false respectively
  const globalFlags = (window as any).FEATURE_FLAGS || {
    enableTf: true,
    enableFaceMesh: true,
    enableProctoring: true,
    forceCpu: true,
    enableIdentityMatching: true,
    enableDiagnosticsRendering: false,
    enableLandmarkDrawing: false
  };

  let enableTf = globalFlags.enableTf;
  let enableFaceMesh = globalFlags.enableFaceMesh;
  let enableProctoring = globalFlags.enableProctoring;
  let forceCpu = globalFlags.forceCpu;
  let enableIdentityMatching = globalFlags.enableIdentityMatching ?? true;
  let enableDiagnosticsRendering = globalFlags.enableDiagnosticsRendering ?? false;
  let enableLandmarkDrawing = globalFlags.enableLandmarkDrawing ?? false;

  // Query parameter overrides (highest precedence)
  if (params.has('enable_tf')) {
    enableTf = params.get('enable_tf') !== 'false';
  }
  if (params.has('enable_facemesh')) {
    enableFaceMesh = params.get('enable_facemesh') !== 'false';
  }
  if (params.has('enable_proctoring')) {
    enableProctoring = params.get('enable_proctoring') !== 'false';
  }
  if (params.has('force_cpu')) {
    forceCpu = params.get('force_cpu') === 'true';
  }
  if (params.has('enable_identity_matching')) {
    enableIdentityMatching = params.get('enable_identity_matching') === 'true';
  }
  if (params.has('enable_diagnostics_rendering')) {
    enableDiagnosticsRendering = params.get('enable_diagnostics_rendering') === 'true';
  }
  if (params.has('enable_landmark_drawing')) {
    enableLandmarkDrawing = params.get('enable_landmark_drawing') === 'true';
  }

  return { 
    enableTf, 
    enableFaceMesh, 
    enableProctoring, 
    forceCpu,
    enableIdentityMatching,
    enableDiagnosticsRendering,
    enableLandmarkDrawing
  };
};
