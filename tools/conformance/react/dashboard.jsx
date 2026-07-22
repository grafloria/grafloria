import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { GrafloriaDashboard } from '@grafloria/react';

const VIEWS = [
  { id: 'sales', widgets: [
    { id: 'rev', kind: 'kpi', span: 3, data: { label: 'Revenue', value: '$6.8M', delta: 12.4 } },
    { id: 'ord', kind: 'kpi', span: 3, data: { label: 'Orders', value: '1,982', delta: -2.1 } },
    { id: 'trend', kind: 'line', span: 6, rows: 2, data: { series: [10, 14, 12, 19, 23, 21, 28], labels: ['M','T','W','T','F','S','S'] } },
    { id: 'mix', kind: 'donut', span: 3, data: { slices: [{ label: 'EU', value: 44 }, { label: 'US', value: 31 }, { label: 'APAC', value: 25 }] } },
    { id: 'deploys', kind: 'deploys', span: 3, data: { items: [{ name: 'api', state: 'live' }, { name: 'web', state: 'building' }] } },
  ]},
  { id: 'ops', widgets: [
    { id: 'cpu', kind: 'kpi', span: 4, data: { label: 'CPU', value: '42%' } },
    { id: 'errors', kind: 'bar', span: 8, rows: 2, data: { bars: [{ label: 'mon', value: 3 }, { label: 'tue', value: 7 }, { label: 'wed', value: 2 }] } },
  ]},
];

function Deploys({ data }) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 8, background: '#1d3557',
                  color: '#f1faee', padding: 10, boxSizing: 'border-box', font: '12px system-ui' }}>
      <strong>Deploys (React component)</strong>
      {data.items.map((d) => <div key={d.name}>{d.name} — {d.state}</div>)}
    </div>
  );
}

function App() {
  const [tab, setTab] = useState('sales');
  return (
    <div>
      <h2>Dashboard kit — the React way</h2>
      <p>
        <button id="tab-sales" onClick={() => setTab('sales')}>sales</button>
        <button id="tab-ops" onClick={() => setTab('ops')}>ops</button>
      </p>
      <GrafloriaDashboard views={VIEWS} activeView={tab}
        widgetTypes={{ deploys: Deploys }}
        style={{ display: 'block', width: 860, height: 430, border: '1px solid #ccc' }} />
    </div>
  );
}
createRoot(document.getElementById('app')).render(<App />);
