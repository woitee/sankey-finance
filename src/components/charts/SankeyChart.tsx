import { useMemo } from 'react';
import { SafeEChart } from './SafeEChart';
import type { SankeyData } from '../../types/chart';
import { formatCurrency } from '../../utils/currency';

export function SankeyChart({
  data,
  height = 500,
  onNodeClick,
  onLinkClick,
}: {
  data: SankeyData;
  height?: number;
  onNodeClick?: (name: string) => void;
  onLinkClick?: (source: string, target: string) => void;
}) {
  const onEvents = useMemo(() => {
    if (!onNodeClick && !onLinkClick) return undefined;
    return {
      click: (params: any) => {
        if (params.dataType === 'node') {
          onNodeClick?.(params.name);
        } else if (params.dataType === 'edge') {
          if (onLinkClick) {
            onLinkClick(params.data.source, params.data.target);
          } else {
            onNodeClick?.(params.data.target);
          }
        }
      },
    };
  }, [onNodeClick, onLinkClick]);

  const option = {
    tooltip: {
      trigger: 'item' as const,
      triggerOn: 'mousemove' as const,
      formatter: (params: any) => {
        if (params.dataType === 'edge') {
          const mw: number | undefined = params.data.mustWant;
          const mwLine = mw
            ? `<br/><span style="color:#c49adf;font-size:11px">⟳ ${formatCurrency(mw)} from MUST/WANT split</span>`
            : '';
          return `${params.data.source} → ${params.data.target}<br/><strong>${formatCurrency(params.data.value)}</strong>${mwLine}`;
        }
        return `<strong>${params.name}</strong><br/>${formatCurrency(params.value)}`;
      },
    },
    series: [
      {
        type: 'sankey' as const,
        data: data.nodes,
        links: data.links,
        orient: 'horizontal' as const,
        nodeAlign: 'left' as const,
        layoutIterations: 32,
        animationDuration: 250,
        emphasis: { focus: 'adjacency' as const },
        lineStyle: { color: 'source' as const, curveness: 0.4, opacity: 0.25 },
        label: {
          position: 'right' as const,
          fontSize: 12,
          color: '#b0b8c8',
          formatter: (params: any) => {
            return `${params.name}  ${formatCurrency(params.value)}`;
          },
        },
        nodeWidth: 18,
        nodeGap: 14,
        itemStyle: { borderWidth: 0 },
      },
    ],
  };

  return (
    <SafeEChart
      option={option}
      style={{ height, width: '100%', cursor: onNodeClick ? 'pointer' : undefined }}
      opts={{ renderer: 'canvas' }}
      onEvents={onEvents}
    />
  );
}
