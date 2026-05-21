import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { config, isProduction } from "./env.config";

export const initializeSentry = () => {
  if (!config.SENTRY_DSN) {
    console.warn("[Sentry] No SENTRY_DSN provided. Sentry initialization skipped.");
    return;
  }

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.APP_ENV,
    integrations: [
      nodeProfilingIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: isProduction ? 0.2 : 1.0, // Capture 20% of transactions in prod, 100% otherwise
    // Set sampling rate for profiling
    profilesSampleRate: isProduction ? 0.1 : 1.0,
  });

  console.log(`[Sentry] Initialized for environment: ${config.APP_ENV}`);
};

// Custom tracker for WebSocket/Upload failures
export const trackFailure = (context: string, error: Error | unknown, extra?: Record<string, any>) => {
  console.error(`[Failure Tracking: ${context}]`, error);
  if (config.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      scope.setTag("context", context);
      if (extra) {
        scope.setExtras(extra);
      }
      Sentry.captureException(error);
    });
  }
};
