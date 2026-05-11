/**
 * Hook-based ECharts wrapper that correctly handles React 18 StrictMode's
 * double-invoke (mount → unmount → remount). Unlike echarts-for-react (a class
 * component), this runs all side-effects inside useEffect with proper cleanup,
 * so each StrictMode cycle gets a fresh instance and no "disposed" warnings.
 */
import { useRef, useEffect, useCallback } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption, EChartsType } from 'echarts';

type EventMap = Record<string, (params: unknown) => void>;

interface Props {
  option: EChartsOption;
  style?: React.CSSProperties;
  opts?: Parameters<typeof echarts.init>[2];
  onEvents?: EventMap;
  notMerge?: boolean;
}

export function SafeEChart({ option, style, opts, onEvents, notMerge = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);

  // Mount / unmount — create and destroy the echarts instance
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el, undefined, opts);
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (chartRef.current && !chartRef.current.isDisposed()) {
        chartRef.current.resize();
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // opts is intentionally excluded — changing renderer after init is not supported
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync option whenever it changes
  useEffect(() => {
    const chart = chartRef.current;
    if (chart && !chart.isDisposed()) {
      chart.setOption(option, notMerge);
    }
  }, [option, notMerge]);

  // Sync event handlers — detach old ones, attach new ones
  const prevEvents = useRef<EventMap>({});
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;

    // Remove stale handlers
    for (const [name, handler] of Object.entries(prevEvents.current)) {
      chart.off(name, handler as (...args: unknown[]) => void);
    }
    // Add current handlers
    const current = onEvents ?? {};
    for (const [name, handler] of Object.entries(current)) {
      chart.on(name, handler as (...args: unknown[]) => void);
    }
    prevEvents.current = current;
  }, [onEvents]);

  return <div ref={containerRef} style={style} />;
}

export type { EChartsOption };
