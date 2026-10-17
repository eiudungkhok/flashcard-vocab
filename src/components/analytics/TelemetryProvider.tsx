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
  const lastTickRef = useRef<number>(Date.now());
  const lastStudyInteractionRef = useRef<number>(0);

  const recordStudyInteraction = useCallback(() => {
    lastStudyInteractionRef.current = Date.now();
  }, []);

  useEffect(() => {
    lastTickRef.current = Date.now();

    const recordTime = () => {
      if (document.visibilityState === 'hidden') {
        lastTickRef.current = Date.now();
        return;
      }

      const now = Date.now();
      const elapsedSec = Math.round((now - lastTickRef.current) / 1000);
      lastTickRef.current = now;

      if (elapsedSec <= 0 || elapsedSec > 300) return;

      const isStudy =
        pathname.includes('/study') ||
        now - lastStudyInteractionRef.current <= TRACKING_CONFIG.STUDY_INTERACTION_WINDOW_SEC * 1000;

      // Lưu ngay vào bộ nhớ trình duyệt để trang Analytics đọc tức thì không bị trễ
      try {
        const raw = localStorage.getItem('flashlearn_telemetry_stats');
        const current = raw
          ? JSON.parse(raw)
          : { totalSec: 0, studySec: 0, daily: {}, lastDevice: 'Desktop' };

        const todayVN = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
        const prevDaily = Number(current.daily?.[todayVN] || 0);
        const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent);

        const updated = {
          totalSec: Number(current.totalSec || 0) + elapsedSec,
          studySec: Number(current.studySec || 0) + (isStudy ? elapsedSec : 0),
          daily: {
            ...(current.daily || {}),
            [todayVN]: prevDaily + elapsedSec,
          },
          lastDevice: isMobile ? 'Mobile' : 'Desktop',
          updatedAt: new Date().toISOString(),
        };

        localStorage.setItem('flashlearn_telemetry_stats', JSON.stringify(updated));
      } catch (e) {
        // Bỏ qua nếu trình duyệt chặn localStorage
      }
    };

    const intervalId = setInterval(recordTime, 5000);

    return () => {
      clearInterval(intervalId);
      recordTime();
    };
  }, [pathname]);

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