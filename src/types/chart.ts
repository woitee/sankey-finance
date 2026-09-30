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

export interface IncomeSourceFilter {
  category?: string;
  subcategory?: string;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
  /** Income-source node name → transaction filter it represents (only when showIncomeSources). */
  incomeSources?: Record<string, IncomeSourceFilter>;
}

export interface MonthlySummary {
  period: string;
  totalIncome: number;
  totalOutcome: number;
  savings: number;
  byCategory: Record<string, number>;
}
