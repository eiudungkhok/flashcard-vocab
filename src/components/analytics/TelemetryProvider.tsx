// src/components/analytics/TelemetryProvider.tsx
'use client';

import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { TRACKING_CONFIG } from '@/utils/analytics/timeEngine';

const TelemetryContext = createContext<any>(null);

export function useTelemetry(): any {
  const context = useContext(TelemetryContext);
  if (!context) {
    return new Proxy(
      {},
      {
        get: () => () => {},
      }
    );
  }
  return context;
}

export default function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const startTimeRef = useRef<number>(Date.now());
  const lastStudyInteractionRef = useRef<number>(0);

  const recordStudyInteraction = useCallback(() => {
    lastStudyInteractionRef.current = Date.now();
  }, []);

  useEffect(() => {
    startTimeRef.current = Date.now();

    const sendTelemetry = () => {
      const now = Date.now();
      const rawStart = startTimeRef.current;
      const rawEnd = now;

      if (rawEnd - rawStart < 1000) return;

      const isRecentStudy =
        now - lastStudyInteractionRef.current <= TRACKING_CONFIG.STUDY_INTERACTION_WINDOW_SEC * 1000;

      const payload = JSON.stringify({
        path: pathname,
        rawStart,
        rawEnd,
        kind: pathname.includes('/study') || isRecentStudy ? 'study' : 'dashboard',
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/telemetry', payload);
      } else {
        fetch('/api/telemetry', {
          method: 'POST',
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }

      startTimeRef.current = Date.now();
    };

    const intervalId = setInterval(
      sendTelemetry,
      TRACKING_CONFIG.HEARTBEAT_INTERVAL_SEC * 1000
    );

    window.addEventListener('beforeunload', sendTelemetry);
    return () => {
      clearInterval(intervalId);
      sendTelemetry();
      window.removeEventListener('beforeunload', sendTelemetry);
    };
  }, [pathname]);

  // Proxy giúp mọi hàm được gọi từ StudyClient (như recordStudyInteraction, markActivity, v.v.) đều hoạt động an toàn
  const contextValue = useRef(
    new Proxy(
      {
        recordStudyInteraction,
        markStudyInteraction: recordStudyInteraction,
        trackInteraction: recordStudyInteraction,
        recordInteraction: recordStudyInteraction,
      },
      {
        get(target: any, prop: string) {
          if (prop in target) return target[prop];
          return recordStudyInteraction;
        },
      }
    )
  ).current;

  return (
    <TelemetryContext.Provider value={contextValue}>
      {children}
    </TelemetryContext.Provider>
  );
}