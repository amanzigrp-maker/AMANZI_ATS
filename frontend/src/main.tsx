import { createRoot } from "react-dom/client";
import "./config/environment";
import App from "./App.tsx";
import "./index.css";

import * as tf from "@tensorflow/tfjs";

async function initTF() {
  try {
    await tf.setBackend("webgl");
    await tf.ready();
    console.log("TF backend initialized at startup:", tf.getBackend());
  } catch (err) {
    console.warn("WebGL unavailable at startup, staying on CPU — expect slowdowns", err);
  }
}

// Fire initialization immediately
void initTF();

import * as Sentry from "@sentry/react";
import { frontendConfig } from "./config/environment";

if (frontendConfig.sentryDsn) {
  Sentry.init({
    dsn: frontendConfig.sentryDsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

createRoot(document.getElementById("root")!).render(<App />);
