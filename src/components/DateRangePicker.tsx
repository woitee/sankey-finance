import { useState, useMemo } from 'react';

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

type Option = { label: string; from: string; to: string };
type Mode = 'month' | 'quarter' | 'year' | 'custom';

function yearOptions(): Option[] {
  const now = new Date();
  return Array.from({ length: 4 }, (_, i) => {
    const y = now.getFullYear() - i;
    return {
      label: String(y),
      from: `${y}-01-01`,
      to: y === now.getFullYear() ? fmt(now) : `${y}-12-31`,
    };
  });
}

function quarterOptions(): Option[] {
  const now = new Date();
  const options: Option[] = [];
  let year = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3);
  for (let i = 0; i < 8; i++) {
    const startMonth = q * 3;
    const end = lastDayOfMonth(year, startMonth + 2);
    options.push({
      label: `Q${q + 1} ${year}`,
      from: fmt(new Date(year, startMonth, 1)),
      to: end >= now ? fmt(now) : fmt(end),
    });
    if (--q < 0) { q = 3; year--; }
  }
  return options;
}

function monthOptions(): Option[] {
  const now = new Date();
  const options: Option[] = [];
  let year = now.getFullYear();
  let month = now.getMonth();
  for (let i = 0; i < 18; i++) {
    const end = lastDayOfMonth(year, month);
    options.push({
      label: new Date(year, month, 1).toLocaleString('en', { month: 'short', year: 'numeric' }),
      from: fmt(new Date(year, month, 1)),
      to: end >= now ? fmt(now) : fmt(end),
    });
    if (--month < 0) { month = 11; year--; }
  }
  return options;
}

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

const selectStyle: React.CSSProperties = {
  background: '#1e1e2e',
  border: '1px solid #45475a',
  borderRadius: 6,
  color: '#cdd6f4',
  fontSize: 13,
  padding: '5px 8px',
  cursor: 'pointer',
  colorScheme: 'dark',
};

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [mode, setMode] = useState<Mode>('month');
  const [selectedLabel, setSelectedLabel] = useState<string>(() => monthOptions()[0].label);

  const options = useMemo((): Option[] => {
    if (mode === 'year') return yearOptions();
    if (mode === 'quarter') return quarterOptions();
    if (mode === 'month') return monthOptions();
    return [];
  }, [mode]);

  const handleModeChange = (m: Mode) => {
    const opts = m === 'year' ? yearOptions()
      : m === 'quarter' ? quarterOptions()
      : m === 'month' ? monthOptions()
      : [];
    setMode(m);
    if (opts.length > 0) {
      setSelectedLabel(opts[0].label);
      onChange(opts[0].from, opts[0].to);
    }
  };

  const handleOptionChange = (label: string) => {
    const o = options.find(opt => opt.label === label);
    if (o) { setSelectedLabel(label); onChange(o.from, o.to); }
  };

  const inputStyle: React.CSSProperties = {
    ...selectStyle,
    colorScheme: 'dark',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select
        value={mode}
        onChange={e => handleModeChange(e.target.value as Mode)}
        style={selectStyle}
      >
        <option value="month">Month</option>
        <option value="quarter">Quarter</option>
        <option value="year">Year</option>
        <option value="custom">Custom</option>
      </select>

      {mode === 'custom' ? (
        <>
          <input
            type="date"
            value={from}
            onChange={e => onChange(e.target.value, to)}
            style={inputStyle}
          />
          <span style={{ color: '#64748b', fontSize: 13 }}>–</span>
          <input
            type="date"
            value={to}
            onChange={e => onChange(from, e.target.value)}
            style={inputStyle}
          />
        </>
      ) : (
        <select
          value={selectedLabel}
          onChange={e => handleOptionChange(e.target.value)}
          style={selectStyle}
        >
          {options.map(o => (
            <option key={o.label} value={o.label}>{o.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}
