import { Toolbar } from '@/components/Toolbar';
import { TimeScaleIndicator } from '@/components/TimeScaleIndicator';
import { MetricsPanel } from '@/components/MetricsPanel';
import { BodyEditor, SimCanvas } from '@/components/SimView';
import '@/components/App.css';

export function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <Toolbar />
        <TimeScaleIndicator />
        <MetricsPanel />
        <BodyEditor />
      </aside>
      <main className="main">
        <SimCanvas />
      </main>
    </div>
  );
}
