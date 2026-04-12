import { useState, useRef, useEffect } from 'react';

interface ComboBoxProps {
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
  onCancel: () => void;
}

export function ComboBox({ value, options, placeholder, onChange, onCancel }: ComboBoxProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(query.toLowerCase()),
  );

  const isNew = query.trim() && !options.includes(query.trim());

  const commit = (val: string) => {
    if (val.trim()) onChange(val.trim());
    else onCancel();
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={e => {
          if (e.key === 'Enter') commit(query);
          if (e.key === 'Escape') onCancel();
        }}
        style={{
          width: '100%',
          padding: '4px 6px',
          background: '#1e1e2e',
          color: '#cdd6f4',
          border: '1px solid #6366f1',
          borderRadius: 4,
          fontSize: 12,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {open && (filtered.length > 0 || isNew) && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: 200,
            overflowY: 'auto',
            background: '#1e1e2e',
            border: '1px solid #313244',
            borderRadius: '0 0 4px 4px',
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          {isNew && (
            <div
              onClick={() => commit(query)}
              style={{
                padding: '6px 8px',
                fontSize: 12,
                cursor: 'pointer',
                color: '#6366f1',
                borderBottom: '1px solid #313244',
              }}
              onMouseDown={e => e.preventDefault()}
            >
              + Create "{query.trim()}"
            </div>
          )}
          {filtered.map(opt => (
            <div
              key={opt}
              onClick={() => commit(opt)}
              onMouseDown={e => e.preventDefault()}
              style={{
                padding: '6px 8px',
                fontSize: 12,
                cursor: 'pointer',
                color: opt === value ? '#6366f1' : '#cdd6f4',
                background: opt === value ? '#6366f11a' : undefined,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#313244')}
              onMouseLeave={e => (e.currentTarget.style.background = opt === value ? '#6366f11a' : '')}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
