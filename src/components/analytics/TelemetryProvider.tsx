// src/components/analytics/TelemetryProvider.tsx
'use client';

import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { TRACKING_CONFIG } from '@/utils/analytics/timeEngine';

const TelemetryContext = createContext<any>(null);

export function useTelemetry(): any {
  const context = useContext(TelemetryContext);
  if (!context) {
    return new Proxy({}, { get: () => () => {} });
  }
  return context;
}

export default function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lastTickRef = useRef<number>(Date.now());
  const lastUserActivityRef = useRef<number>(Date.now());
  const lastStudyInteractionRef = useRef<number>(0);
  const activeDeckIdRef = useRef<string | null>(null);
  const visitIdRef = useRef<string | null>(null);
  const lastRecordedPathRef = useRef<string>('');
  const hasSyncedLocalRef = useRef<boolean>(false);

  const recordStudyInteraction = useCallback((deckId?: string) => {
    const now = Date.now();
    lastStudyInteractionRef.current = now;
    lastUserActivityRef.current = now;
    if (deckId) activeDeckIdRef.current = deckId;
  }, []);

  // 1. Đồng bộ ngay số giây đã có trong localStorage (VD: 1 phút 17 giây) lên Database cho Giảng viên thấy ngay
  useEffect(() => {
    if (hasSyncedLocalRef.current) return;
    hasSyncedLocalRef.current = true;

    try {
      const savedVisit = sessionStorage.getItem('flashlearn_visit_id');
      if (savedVisit) visitIdRef.current = savedVisit;

      const raw = localStorage.getItem('flashlearn_telemetry_stats');
      if (raw) {
        const parsed = JSON.parse(raw);
        const totalSec = Number(parsed.totalSec || 0);
        const studySec = Number(parsed.studySec || 0);
        if (totalSec > 0) {
          fetch('/api/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventType: 'sync_local',
              path: pathname || '/student',
              visitId: visitIdRef.current,
              totalSec,
              studySec,
              rawStart: Date.now() - Math.min(totalSec, 30) * 1000,
              rawEnd: Date.now(),
            }),
            keepalive: true,
          })
            .then((r) => r.json())
            .then((res) => {
              if (res?.visitId) {
                visitIdRef.current = res.visitId;
                sessionStorage.setItem('flashlearn_visit_id', res.visitId);
              }
            })
            .catch(() => {});
        }
      }
    } catch {}
  }, [pathname]);

  // 2. Lắng nghe tương tác thật trên trang
  useEffect(() => {
    const onUserActivity = () => {
      lastUserActivityRef.current = Date.now();
    };

    window.addEventListener('keydown', onUserActivity, { passive: true });
    window.addEventListener('mousedown', onUserActivity, { passive: true });
    window.addEventListener('touchstart', onUserActivity, { passive: true });
    window.addEventListener('scroll', onUserActivity, { passive: true });

    return () => {
      window.removeEventListener('keydown', onUserActivity);
      window.removeEventListener('mousedown', onUserActivity);
      window.removeEventListener('touchstart', onUserActivity);
      window.removeEventListener('scroll', onUserActivity);
    };
  }, []);

  // 3. Ghi nhận lượt xem trang (Page View)
  useEffect(() => {
    if (!pathname || pathname.startsWith('/api') || pathname.startsWith('/_next')) return;
    if (lastRecordedPathRef.current === pathname) return;
    lastRecordedPathRef.current = pathname;

    fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'pageview',
        path: pathname,
        visitId: visitIdRef.current,
        rawStart: Date.now() - 1000,
        rawEnd: Date.now(),
      }),
      keepalive: true,
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.visitId) {
          visitIdRef.current = res.visitId;
          try {
            sessionStorage.setItem('flashlearn_visit_id', res.visitId);
          } catch {}
        }
      })
      .catch(() => {});
  }, [pathname]);

  // 4. Vòng lặp Heartbeat định kỳ
  useEffect(() => {
    lastTickRef.current = Date.now();

    const flushInterval = (isUnloading = false) => {
      const now = Date.now();
      const rawStart = lastTickRef.current;
      const rawEnd = now;
      lastTickRef.current = now;

      if (document.visibilityState === 'hidden' && !isUnloading) {
        return;
      }

      const elapsedSec = Math.min(
        Math.round((rawEnd - rawStart) / 1000),
        TRACKING_CONFIG.MAX_CREDITED_GAP_SEC
      );
      if (elapsedSec < 1) return;

      const isActive =
        now - lastUserActivityRef.current <= TRACKING_CONFIG.IDLE_THRESHOLD_SEC * 1000;
      const isStudying =
        pathname.includes('/study') ||
        now - lastStudyInteractionRef.current <= TRACKING_CONFIG.STUDY_INTERACTION_WINDOW_SEC * 1000;

      try {
        const raw = localStorage.getItem('flashlearn_telemetry_stats');
        const current = raw
          ? JSON.parse(raw)
          : { totalSec: 0, activeSec: 0, studySec: 0, daily: {}, lastDevice: 'Desktop' };

        const todayVN = new Date(now + TRACKING_CONFIG.VN_OFFSET_MS).toISOString().slice(0, 10);
        const prevDaily = Number(current.daily?.[todayVN] || 0);
        const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent);

        const updated = {
          totalSec: Number(current.totalSec || 0) + elapsedSec,
          activeSec: Number(current.activeSec || 0) + (isActive ? elapsedSec : 0),
          studySec: Number(current.studySec || 0) + (isStudying ? elapsedSec : 0),
          daily: {
            ...(current.daily || {}),
            [todayVN]: prevDaily + (isActive ? elapsedSec : 0),
          },
          lastDevice: isMobile ? 'Mobile' : 'Desktop',
          updatedAt: new Date(now).toISOString(),
        };
        localStorage.setItem('flashlearn_telemetry_stats', JSON.stringify(updated));
      } catch {}

      const payload = JSON.stringify({
        eventType: isUnloading ? 'unload' : 'heartbeat',
        visitId: visitIdRef.current,
        path: pathname,
        deckId: activeDeckIdRef.current,
        rawStart,
        rawEnd,
        isActive,
        isStudying,
        kind: isStudying ? 'study' : isActive ? 'active' : 'presence',
      });

      if (isUnloading && navigator.sendBeacon) {
        navigator.sendBeacon('/api/telemetry', payload);
      } else {
        fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        })
          .then((r) => r.json())
          .then((res) => {
            if (res?.visitId) {
              visitIdRef.current = res.visitId;
              try {
                sessionStorage.setItem('flashlearn_visit_id', res.visitId);
              } catch {}
            }
          })
          .catch(() => {});
      }
    };

    const timer = setInterval(() => flushInterval(false), 10000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushInterval(true);
      } else {
        lastTickRef.current = Date.now();
        lastUserActivityRef.current = Date.now();
      }
    };

    const onBeforeUnload = () => flushInterval(true);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
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