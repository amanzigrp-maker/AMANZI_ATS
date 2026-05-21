import { useEffect } from 'react';
import { onCLS, onINP, onLCP, onFCP, onTTFB, Metric } from 'web-vitals';
import * as Sentry from '@sentry/react';

export const usePerformanceMetrics = () => {
  useEffect(() => {
    const sendToSentry = (metric: Metric) => {
      // Map metric name to Sentry format
      const sentryMetricName = `web-vitals.${metric.name}`;
      
      Sentry.metrics.distribution(sentryMetricName, metric.value, {
        tags: {
          rating: metric.rating, // 'good' | 'needs-improvement' | 'poor'
        },
      });

      console.debug(`[Performance] ${metric.name}: ${metric.value} (${metric.rating})`);
    };

    onCLS(sendToSentry);
    onINP(sendToSentry);
    onLCP(sendToSentry);
    onFCP(sendToSentry);
    onTTFB(sendToSentry);
  }, []);
};
