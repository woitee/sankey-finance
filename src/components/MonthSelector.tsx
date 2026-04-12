export function MonthSelector({
  periods,
  selected,
  onChange,
}: {
  periods: string[];
  selected: string;
  onChange: (period: string) => void;
}) {
  return (
    <select
      value={selected}
      onChange={e => onChange(e.target.value)}
      style={{
        background: '#1e1e2e',
        color: '#cdd6f4',
        border: '1px solid #313244',
        borderRadius: 8,
        padding: '8px 14px',
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      {periods.map(p => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  );
}
