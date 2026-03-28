import React, { useState } from 'react';
import { useSimulation } from './hooks/useSimulation';
import { LiveGauge } from './components/Gauge';
import { WarningCard } from './components/WarningCard';
import { EnergyChart } from './components/EnergyChart';
import { TemperatureChart } from './components/TemperatureChart';
import { TemperatureControls } from './components/TemperatureControls';
import { AgentCard } from './components/AgentCard';
import { AgentDecisions } from './components/AgentDecisions';
import { ActivityLog } from './components/ActivityLog';
import { AgentTerminal } from './components/AgentTerminal';
import { Download, Upload, RefreshCw, Moon, Sun } from 'lucide-react';
import { downloadCSV } from './utils';
import { parseCSV } from './utils';

export function Dashboard() {
  const { 
    current, history, countdown, isSimulating, setIsSimulating, 
    targetTemp, setTargetTemp, outdoorTemp, importData 
  } = useSimulation();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsedData = parseCSV(text);
      if (parsedData && parsedData.length > 0) {
        importData(parsedData);
      }
    };
    reader.readAsText(file);
  };
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${theme === 'dark' ? 'bg-[#0a0c10] text-gray-100' : 'bg-gray-50 text-gray-900'} p-4 md:p-8 font-sans`}>
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Autonomous Facility Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Environment controller & predictive maintenance</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSimulating(!isSimulating)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isSimulating ? 'animate-spin text-emerald-500' : 'text-gray-400'}`} />
              {isSimulating ? 'Live' : 'Paused'}
            </button>
            <label className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
            <button 
              onClick={() => downloadCSV(history, 'autonomous_sensor_data.csv')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Top Indicators Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-1">
            <LiveGauge 
              value={current.temperature} 
              label="Live Temp" 
              unit="°C" 
              trend={current.temperature > 24.5 ? 'up' : 'stable'} 
            />
          </div>
          <div className="col-span-1 md:col-span-2">
            <WarningCard />
          </div>
        </div>

        {/* Middle Row (Graph & Logs) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <TemperatureChart data={history} targetTemp={targetTemp} />
            <EnergyChart data={history} />
          </div>
          <div className="lg:col-span-1 space-y-6">
            <TemperatureControls 
              outdoorTemp={outdoorTemp}
              targetTemp={targetTemp}
              setTargetTemp={setTargetTemp}
              currentTemp={current.temperature}
            />
            <AgentCard gap={current.temperature - targetTemp} />
            <AgentDecisions gap={current.temperature - targetTemp} />
            <ActivityLog />
          </div>
        </div>

        {/* Terminal/AI Agent area */}
        <AgentTerminal data={current} countdown={countdown} />

      </div>
    </div>
  );
}
