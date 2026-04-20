export interface SankeyNode {
  name: string;
  itemStyle?: { color?: string };
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  mustWant?: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export interface MonthlySummary {
  period: string;
  totalIncome: number;
  totalOutcome: number;
  savings: number;
  byCategory: Record<string, number>;
}
