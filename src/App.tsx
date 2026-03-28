import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Label
} from 'recharts';
import {
  Download, Moon, Sun, Thermometer, Zap, Activity,
  Cpu, Wind, Droplets, Eye, CloudRain
} from 'lucide-react';

interface DataPoint {
  time: string;
  temp: number;
  energy: number;
  target: number;
  outdoor: number;
  humidity: number;
  windSpeed: number;
  airQuality: number;
  rain: number;
}

const OUTDOOR_TEMP = 32.5;

const generateInitialData = (targetTemp: number): DataPoint[] => {
  const data: DataPoint[] = [];
  let currentTemp = 30;
  let currentEnergy = 1450;
  for (let i = -19; i <= 0; i++) {
    const time = new Date(Date.now() + i * 10000).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const diff = targetTemp - currentTemp;
    currentTemp = parseFloat((currentTemp + diff * 0.15 + (Math.random() * 0.5 - 0.25)).toFixed(2));
    currentEnergy = parseFloat(Math.max(currentEnergy - Math.random() * 45, 420 + Math.random() * 80).toFixed(2));
    data.push({
      time,
      temp: currentTemp,
      energy: currentEnergy,
      target: targetTemp,
      outdoor: OUTDOOR_TEMP,
      humidity: parseFloat((44 + Math.random() * 6).toFixed(1)),
      windSpeed: parseFloat((10 + Math.random() * 8).toFixed(1)),
      airQuality: parseFloat((40 + Math.random() * 20).toFixed(1)),
      rain: parseFloat((Math.random() * 5).toFixed(2)),
    });
  }
  return data;
};

const WIND_DIRECTIONS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const getWindDir = () => WIND_DIRECTIONS[Math.floor(Math.random() * WIND_DIRECTIONS.length)];

const getMoistureCondition = (rain: number, humidity: number) => {
  if (rain > 3) return 'Heavy Rain';
  if (rain > 1) return 'Light Rain';
  if (humidity > 65) return 'Humid';
  if (humidity > 50) return 'Moderate';
  return 'Dry';
};

const getAQLabel = (aqi: number) => {
  if (aqi < 50) return { label: 'Good', color: 'text-emerald-500' };
  if (aqi < 100) return { label: 'Moderate', color: 'text-amber-500' };
  return { label: 'Poor', color: 'text-red-500' };
};

const TempTooltip = ({ active, payload, label, targetTemp }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
        <p style={{ color: '#9ca3af', marginBottom: 4 }}>{label}</p>
        <p style={{ color: '#f97316', marginBottom: 2 }}>temp : {payload[0]?.value}°C</p>
        <p style={{ color: '#10b981' }}>ideal : {targetTemp}°C</p>
      </div>
    );
  }
  return null;
};

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [targetTemp, setTargetTemp] = useState(22);
  const [targetEnergy, setTargetEnergy] = useState(600);
  const [data, setData] = useState<DataPoint[]>(() => generateInitialData(22));
  const [countdown, setCountdown] = useState(10);
  const [windDir, setWindDir] = useState('NW');

  const [wsConnected, setWsConnected] = useState(false);
  const [agentCommand, setAgentCommand] = useState<{
    action: string; reason: string; ac_power: number;
    fan_power: number; cooling_draw_w: number; label: string;
    reward: number; avg_reward_10: number;
  } | null>(null);

  useEffect(() => {
    const WS_URL = 'ws://localhost:8765';
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => { setWsConnected(true); };
      ws.onmessage = (evt) => {
        try {
          const d = JSON.parse(evt.data);
          if (d.action) {
            setAgentCommand({
              action:         d.action,
              reason:         d.reason ?? '',
              ac_power:       d.ac_power ?? 0,
              fan_power:      d.fan_power ?? 0,
              cooling_draw_w: d.cooling_draw_w ?? 0,
              label:          d.label ?? '',
              reward:         d.reward ?? 0,
              avg_reward_10:  d.avg_reward_10 ?? 0,
            });
          }
          if (d.outdoor_temp_c !== undefined) {
            setData(prev => {
              if (!prev.length) return prev;
              const last = prev[prev.length - 1];
              return [...prev.slice(0, -1), {
                ...last,
                outdoor: d.outdoor_temp_c,
                humidity: d.humidity_pct ?? last.humidity,
                windSpeed: d.wind_kmh ?? last.windSpeed,
                airQuality: d.aqi ?? last.airQuality,
                rain: d.rain_mm ?? last.rain,
              }];
            });
            setWindDir(d.wind_dir ?? windDir);
          }
        } catch { /* ignore malformed frames */ }
      };
      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [decisions, setDecisions] = useState([
    { tag: 'ac_high', label: 'too hot', score: '0.61', good: false },
    { tag: 'ac_high', label: 'still climbing', score: '0.65', good: false },
    { tag: 'ac_medium', label: 'tried medium', score: '0.78', good: true },
    { tag: 'ac_medium', label: 'worked well', score: '0.81', good: true },
    { tag: 'ac_medium', label: 'optimal balance', score: '0.81', good: true },
  ]);

  const triggerNextTick = useCallback(() => {
    setWindDir(getWindDir());
    setData((prev) => {
      const last = prev[prev.length - 1];
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const diff = targetTemp - last.temp;
      const newTemp = parseFloat((last.temp + diff * 0.2 + (Math.random() * 0.4 - 0.2)).toFixed(2));
      const energyDiff = targetEnergy - last.energy;
      const newEnergy = parseFloat(
        Math.min(1500, Math.max(300,
          last.energy + energyDiff * 0.15 + (Math.random() * 30 - 15)
        )).toFixed(2)
      );
      const gapNow = Math.abs(newTemp - targetTemp);
      let newTag: string, newLabel: string, newScore: string, newGood: boolean;
      if (gapNow > 5) {
        newTag = 'ac_high'; newLabel = 'too hot'; newScore = (0.45 + Math.random() * 0.2).toFixed(2); newGood = false;
      } else if (gapNow > 3) {
        newTag = 'ac_high'; newLabel = 'still climbing'; newScore = (0.55 + Math.random() * 0.15).toFixed(2); newGood = false;
      } else if (gapNow > 1.5) {
        newTag = 'ac_medium'; newLabel = 'tried medium'; newScore = (0.70 + Math.random() * 0.1).toFixed(2); newGood = true;
      } else if (gapNow > 0.5) {
        newTag = 'ac_medium'; newLabel = 'worked well'; newScore = (0.78 + Math.random() * 0.1).toFixed(2); newGood = true;
      } else {
        newTag = 'fan_only'; newLabel = 'optimal balance'; newScore = (0.85 + Math.random() * 0.1).toFixed(2); newGood = true;
      }
      setDecisions((prevD) => [...prevD.slice(-4), { tag: newTag, label: newLabel, score: newScore, good: newGood }]);
      return [...prev.slice(-19), {
        time,
        temp: newTemp,
        energy: newEnergy,
        target: targetTemp,
        outdoor: OUTDOOR_TEMP,
        humidity: parseFloat((44 + Math.random() * 6).toFixed(1)),
        windSpeed: parseFloat((10 + Math.random() * 8).toFixed(1)),
        airQuality: parseFloat((40 + Math.random() * 20).toFixed(1)),
        rain: parseFloat((Math.random() * 5).toFixed(2)),
      }];
    });
  }, [targetTemp, targetEnergy]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { triggerNextTick(); return 10; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [triggerNextTick]);

  const handleExport = () => {
    const headerRow1 = ['timestamp', 'temp_controls,,,', 'energy_controls,,,', 'outdoor_conditions,,,,,'].join(',');
    const headerRow2 = ['time', 'indoor_temp', 'outdoor_temp', 'target_temp', 'temp_gap', 'current_energy_w', 'target_energy_w', 'energy_gap_w', 'outdoor_temp_c', 'humidity_pct', 'wind_kmh', 'wind_dir', 'aqi', 'rain_mm'].join(',');
    const rows = data.map(row => {
      const tGap = (row.temp - targetTemp).toFixed(2);
      const eGap = (row.energy - targetEnergy).toFixed(0);
      return [row.time, row.temp, OUTDOOR_TEMP, targetTemp, tGap, row.energy, targetEnergy, eGap, OUTDOOR_TEMP, row.humidity, row.windSpeed, windDir, row.airQuality.toFixed(0), row.rain].join(',');
    });
    const csvContent = [headerRow1, headerRow2, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'autonomous_sensor_data.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const latestData = data[data.length - 1];
  const outdoorHumidity = latestData?.humidity ?? 47;
  const outdoorWind = latestData?.windSpeed ?? 12;
  const outdoorAQ = latestData?.airQuality ?? 55;
  const outdoorRain = latestData?.rain ?? 0;
  const moistureCondition = getMoistureCondition(outdoorRain, outdoorHumidity);
  const aqInfo = getAQLabel(outdoorAQ);
  const indoorGap = latestData ? (latestData.temp - targetTemp).toFixed(1) : '0.0';
  const currentGapVal = latestData ? Math.abs(latestData.temp - targetTemp) : 0;
  const currentEnergy = latestData?.energy ?? 900;
  const energyGap = (currentEnergy - targetEnergy).toFixed(0);

  const getAgentThoughts = () => {
    if (currentGapVal > 5) return { action: 'Action: Max Cooling', thought: `Gap is huge (${currentGapVal.toFixed(1)}°C). Spinning up secondary compressors to force thermal drop. Energy at ${currentEnergy}W — acceptable trade-off.` };
    if (currentGapVal > 2) return { action: 'Action: AC Medium', thought: `Moderate ${currentGapVal.toFixed(1)}°C gap. Modulating AC units to balance thermal load. Wind from ${windDir} at ${outdoorWind} km/h — factoring in ambient assist.` };
    return { action: 'Action: Fan Only', thought: `Only ${currentGapVal.toFixed(1)}°C gap. Fan only may suffice — testing energy-efficient option. AQI is ${outdoorAQ.toFixed(0)}, intake filters nominal.` };
  };
  const aiThought = getAgentThoughts();

  const bgMain    = isDark ? 'bg-[#0b0f19] text-gray-200'  : 'bg-gray-100 text-gray-900';
  const cardBg    = isDark ? 'bg-[#111520] border-gray-800' : 'bg-white border-gray-200 shadow-sm';
  const textMuted = isDark ? 'text-gray-400'                : 'text-gray-500';
  const cardInner = isDark ? 'bg-[#1a1f2e] border-gray-800' : 'bg-gray-50 border-gray-200';
  const statCell  = isDark ? 'bg-[#161a26] border-gray-800' : 'bg-gray-50 border-gray-100';

  return (
    <div className={`min-h-screen transition-colors duration-300 ${bgMain} p-4 md:p-6 font-sans`}>
      <style>{`
        input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #3b82f6; border: 2px solid #ffffff; box-shadow: 0 0 0 3px #3b82f6; cursor: pointer; }
        input[type='range']::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #3b82f6; border: 2px solid #ffffff; box-shadow: 0 0 0 3px #3b82f6; cursor: pointer; }
        input[type='range'].energy-slider::-webkit-slider-thumb { background: #10b981; box-shadow: 0 0 0 3px #10b981; }
        input[type='range'].energy-slider::-moz-range-thumb { background: #10b981; box-shadow: 0 0 0 3px #10b981; }
      `}</style>

      <div className="max-w-7xl mx-auto flex flex-col gap-5">

        {/* Header */}
        <header className={`flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b pb-5 ${isDark ? 'border-gray-700/50' : 'border-gray-300'}`}>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Cpu className={isDark ? 'text-emerald-400' : 'text-emerald-600'} size={22} />
              Autonomous Server Room
            </h1>
            <p className={`text-xs ${textMuted} mt-0.5`}>Self-Healing Environment · Distributed Intelligence · Predictive Control</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-mono ${wsConnected ? 'border-emerald-700 bg-emerald-500/10 text-emerald-400' : 'border-red-800 bg-red-500/10 text-red-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {wsConnected ? 'Agent Live' : 'Agent Offline'}
            </div>
            <button onClick={() => setIsDark(!isDark)} className={`p-2 rounded-md border ${cardBg} hover:opacity-80 transition-opacity`}>
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors border border-emerald-500">
              <Download size={14} /> Export CSV
            </button>
          </div>
        </header>

        {/* Row 1: Temp Controls + Gauge */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className={`col-span-1 lg:col-span-2 rounded-xl border ${cardBg} p-5`}>
            <h2 className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-2 mb-4 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              <Thermometer size={14} className="text-blue-500" /> Temperature Controls
            </h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className={`p-3 rounded-lg border ${statCell}`}>
                <div className={`text-[10px] ${textMuted} mb-1 uppercase font-semibold tracking-wide`}>Indoor Temp</div>
                <div className="text-xl font-bold">{latestData?.temp ?? '--'}°C</div>
              </div>
              <div className={`p-3 rounded-lg border ${statCell}`}>
                <div className={`text-[10px] ${textMuted} mb-1 uppercase font-semibold tracking-wide`}>Target Temp</div>
                <div className="text-xl font-bold text-blue-500">{targetTemp}.0°C</div>
              </div>
              <div className={`p-3 rounded-lg border ${statCell}`}>
                <div className={`text-[10px] ${textMuted} mb-1 uppercase font-semibold tracking-wide`}>Gap to Target</div>
                <div className={`text-xl font-bold ${currentGapVal > 2 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {Number(indoorGap) > 0 ? '+' : ''}{indoorGap}°C
                </div>
              </div>
            </div>
            <div className="w-full">
              <div className={`flex justify-between text-[10px] mb-2 font-medium ${textMuted}`}>
                <span>18°C — Extreme Cool</span>
                <span className={`font-semibold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Target: {targetTemp}°C</span>
                <span>30°C — Power Save</span>
              </div>
              <div className="relative w-full h-5 flex items-center">
                <div className={`absolute w-full h-1.5 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />
                <div className="absolute h-1.5 rounded-full bg-blue-500" style={{ width: `${((targetTemp - 18) / (30 - 18)) * 100}%` }} />
                <input type="range" min="18" max="30" step="1" value={targetTemp} onChange={(e) => setTargetTemp(Number(e.target.value))} className="absolute w-full h-1.5 rounded-full appearance-none cursor-pointer bg-transparent" style={{ WebkitAppearance: 'none' }} />
              </div>
            </div>
          </div>

          <div className={`col-span-1 rounded-xl border ${cardBg} p-5 flex flex-col items-center justify-center relative`}>
            <h2 className={`absolute top-5 left-5 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              <Activity size={14} className="text-emerald-500" /> Live Rack Temp
            </h2>
            <div className="relative w-36 h-36 mt-6">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke={isDark ? '#1f2937' : '#e5e7eb'} strokeWidth="7" />
                <circle cx="50" cy="50" r="44" fill="none" stroke={latestData?.temp > targetTemp + 2 ? '#f59e0b' : '#10b981'} strokeWidth="7" strokeDasharray={`${(Math.max(0, Math.min(latestData?.temp ?? 22, 40)) / 40) * 276} 276`} className="transition-all duration-1000 ease-out" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{latestData?.temp}°C</span>
                <span className={`text-[10px] ${textMuted} mt-0.5`}>Server Rack</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Energy Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className={`col-span-1 lg:col-span-2 rounded-xl border ${cardBg} p-5`}>
            <h2 className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-2 mb-4 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              <Zap size={14} className="text-emerald-500" /> Energy Consumption Control
            </h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className={`p-3 rounded-lg border ${statCell}`}>
                <div className={`text-[10px] ${textMuted} mb-1 uppercase font-semibold tracking-wide`}>Current Consumption</div>
                <div className="text-xl font-bold text-amber-500">{currentEnergy} W</div>
              </div>
              <div className={`p-3 rounded-lg border ${statCell}`}>
                <div className={`text-[10px] ${textMuted} mb-1 uppercase font-semibold tracking-wide`}>Target Consumption</div>
                <div className="text-xl font-bold text-emerald-500">{targetEnergy} W</div>
              </div>
              <div className={`p-3 rounded-lg border ${statCell}`}>
                <div className={`text-[10px] ${textMuted} mb-1 uppercase font-semibold tracking-wide`}>Target Gap</div>
                <div className={`text-xl font-bold ${Number(energyGap) > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {Number(energyGap) > 0 ? '+' : ''}{energyGap} W
                </div>
              </div>
            </div>
            <div className="w-full">
              <div className={`flex justify-between text-[10px] mb-2 font-medium ${textMuted}`}>
                <span>300 W — Minimal</span>
                <span className={`font-semibold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>Target: {targetEnergy} W</span>
                <span>1500 W — Full Load</span>
              </div>
              <div className="relative w-full h-5 flex items-center">
                <div className={`absolute w-full h-1.5 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />
                <div className="absolute h-1.5 rounded-full bg-emerald-500" style={{ width: `${((targetEnergy - 300) / (1500 - 300)) * 100}%` }} />
                <input type="range" min="300" max="1500" step="50" value={targetEnergy} onChange={(e) => setTargetEnergy(Number(e.target.value))} className="energy-slider absolute w-full h-1.5 rounded-full appearance-none cursor-pointer bg-transparent" style={{ WebkitAppearance: 'none' }} />
              </div>
            </div>
          </div>

          <div className={`col-span-1 rounded-xl border ${cardBg} p-5 flex flex-col items-center justify-center relative`}>
            <h2 className={`absolute top-5 left-5 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              <Zap size={14} className="text-emerald-500" /> Live Power
            </h2>
            <div className="relative w-36 h-36 mt-6">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke={isDark ? '#1f2937' : '#e5e7eb'} strokeWidth="7" />
                <circle cx="50" cy="50" r="44" fill="none" stroke={currentEnergy > targetEnergy ? '#f59e0b' : '#10b981'} strokeWidth="7" strokeDasharray={`${(Math.min(currentEnergy, 1500) / 1500) * 276} 276`} className="transition-all duration-1000 ease-out" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{currentEnergy}<span className="text-sm font-normal">W</span></span>
                <span className={`text-[10px] ${textMuted} mt-0.5`}>Current Draw</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Outdoor Conditions */}
        <div className={`rounded-xl border ${cardBg} p-5`}>
          <h2 className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-2 mb-4 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            <Eye size={14} className="text-sky-500" /> Outdoor Conditions
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className={`rounded-lg border p-3 ${statCell}`}>
              <div className={`text-[10px] uppercase font-semibold tracking-wide ${textMuted} flex items-center gap-1 mb-2`}><Thermometer size={11} className="text-orange-400" /> Outdoor</div>
              <div className="text-lg font-bold">{OUTDOOR_TEMP}°C</div>
              <div className={`text-[10px] mt-0.5 ${textMuted}`}>Ambient</div>
            </div>
            <div className={`rounded-lg border p-3 ${statCell}`}>
              <div className={`text-[10px] uppercase font-semibold tracking-wide ${textMuted} flex items-center gap-1 mb-2`}><Droplets size={11} className="text-blue-400" /> Humidity</div>
              <div className="text-lg font-bold">{outdoorHumidity}%</div>
              <div className={`text-[10px] mt-0.5 ${textMuted}`}>Relative</div>
            </div>
            <div className={`rounded-lg border p-3 ${statCell}`}>
              <div className={`text-[10px] uppercase font-semibold tracking-wide ${textMuted} flex items-center gap-1 mb-2`}><Wind size={11} className="text-sky-400" /> Wind</div>
              <div className="text-lg font-bold">{outdoorWind} <span className="text-sm font-normal">km/h</span></div>
              <div className={`text-[10px] mt-0.5 ${textMuted}`}>Direction: <span className={isDark ? 'text-sky-300' : 'text-sky-600'}>{windDir}</span></div>
            </div>
            <div className={`rounded-lg border p-3 ${statCell}`}>
              <div className={`text-[10px] uppercase font-semibold tracking-wide ${textMuted} flex items-center gap-1 mb-2`}><Eye size={11} className="text-purple-400" /> Air Quality</div>
              <div className="text-lg font-bold">AQI {outdoorAQ.toFixed(0)}</div>
              <div className={`text-[10px] mt-0.5 font-semibold ${aqInfo.color}`}>{aqInfo.label}</div>
            </div>
            <div className={`rounded-lg border p-3 ${statCell}`}>
              <div className={`text-[10px] uppercase font-semibold tracking-wide ${textMuted} flex items-center gap-1 mb-2`}><CloudRain size={11} className="text-indigo-400" /> Rainfall</div>
              <div className="text-lg font-bold">{outdoorRain} <span className="text-sm font-normal">mm</span></div>
              <div className={`text-[10px] mt-0.5 ${textMuted}`}>Last 10 min</div>
            </div>
            <div className={`rounded-lg border p-3 ${statCell}`}>
              <div className={`text-[10px] uppercase font-semibold tracking-wide ${textMuted} flex items-center gap-1 mb-2`}><Droplets size={11} className="text-teal-400" /> Moisture</div>
              <div className={`text-base font-bold ${outdoorRain > 1 ? 'text-indigo-400' : outdoorHumidity > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>{moistureCondition}</div>
              <div className={`text-[10px] mt-0.5 ${textMuted}`}>Condition</div>
            </div>
          </div>
        </div>

        {/* Row 4: AI Decision + Last 5 Decisions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className={`rounded-xl border ${cardBg} p-5 flex flex-col`}>
            <h2 className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              <Cpu size={14} /> What Our Agent Says
            </h2>
            <div className={`flex-1 rounded-lg p-4 border ${cardInner} flex flex-col justify-center gap-2`}>
              <div className="font-bold text-base text-blue-500">{aiThought.action}</div>
              <div className={`text-sm italic leading-relaxed ${textMuted}`}>&ldquo;{aiThought.thought}&rdquo;</div>
            </div>
            <div className={`text-[10px] mt-3 flex justify-between items-center ${textMuted}`}>
              <span>Updates every cycle</span>
              <span className="flex items-center gap-1"><Zap size={11} className="text-emerald-500" /> Active</span>
            </div>
          </div>

          <div className={`rounded-xl border ${cardBg} p-5 flex flex-col`}>
            <h2 className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              <Activity size={14} /> Last 5 Decisions
            </h2>
            <div className="flex flex-col gap-0">
              {decisions.map((d, i) => (
                <div key={i} className={`flex items-center justify-between py-2.5 ${i < decisions.length - 1 ? `border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}` : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${d.good ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-blue-500/15 text-blue-400 border-blue-500/30'}`}>{d.tag}</span>
                    <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{d.label}</span>
                  </div>
                  <span className={`text-xs font-mono ${d.good ? 'text-emerald-500' : 'text-amber-500'}`}>{d.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 5: Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className={`rounded-xl border ${cardBg} p-4`}>
            <div className="flex justify-between items-center mb-2">
              <h3 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Temperature Over Time</h3>
              <span className={`text-[10px] ${textMuted} flex items-center gap-1.5`}>
                <span className="inline-block w-5 border-t-2 border-dashed border-emerald-500"></span>Ideal {targetTemp}°C
              </span>
            </div>
            <div style={{ width: '100%', height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f97316" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1f2937' : '#e5e7eb'} vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} stroke={isDark ? '#4b5563' : '#9ca3af'} tick={{ fontSize: 10 }} width={32} />
                  <Tooltip content={<TempTooltip targetTemp={targetTemp} />} />
                  <ReferenceLine y={targetTemp} stroke="#10b981" strokeDasharray="5 5" strokeWidth={1.5}>
                    <Label value={`Ideal ${targetTemp}°C`} position="insideTopRight" fill="#10b981" fontSize={10} dy={-6} />
                  </ReferenceLine>
                  <Area type="monotone" dataKey="temp" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#tempGrad)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`rounded-xl border ${cardBg} p-4`}>
            <div className="flex justify-between items-center mb-2">
              <h3 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>AI Energy Optimization</h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>−12% Cost Today</span>
            </div>
            <div style={{ width: '100%', height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1f2937' : '#e5e7eb'} vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={['auto', 'auto']} stroke={isDark ? '#4b5563' : '#9ca3af'} tick={{ fontSize: 10 }} width={32} />
                  <Tooltip contentStyle={{ backgroundColor: isDark ? '#111827' : '#fff', borderColor: isDark ? '#374151' : '#e5e7eb', color: isDark ? '#f3f4f6' : '#111827', fontSize: 12, borderRadius: 8 }} itemStyle={{ color: '#10b981' }} />
                  <ReferenceLine y={targetEnergy} stroke="#6366f1" strokeDasharray="5 5" strokeWidth={1.5}>
                    <Label value={`Target ${targetEnergy}W`} position="insideTopRight" fill="#6366f1" fontSize={10} dy={-6} />
                  </ReferenceLine>
                  <Area type="monotone" dataKey="energy" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#energyGrad)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Row 6: Terminal */}
        <div className={`rounded-xl border overflow-hidden font-mono ${isDark ? 'border-gray-800 bg-[#0d1117]' : 'border-gray-700 bg-[#0d1117]'}`}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-black/30">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">{'>_ AI_AGENT_STREAMSOCKET // LISTENING'}</span>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-400">Next payload in <strong className="text-emerald-400">{countdown}s</strong></span>
              <span className="text-xs text-emerald-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>SECURE
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-800">
            <div className="p-5">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">Outgoing Sensor Payload (Simulated)</div>
              <pre className="text-[11px] leading-relaxed text-blue-300 whitespace-pre-wrap overflow-x-auto">
{`{
  "sensorId": "ENV_M_04",
  "indoor_temp_c": ${latestData?.temp},
  "outdoor_temp_c": ${OUTDOOR_TEMP},
  "hum_pct": ${outdoorHumidity},
  "wind_kmh": ${outdoorWind},
  "wind_dir": "${windDir}",
  "aqi": ${outdoorAQ.toFixed(0)},
  "rain_mm": ${outdoorRain},
  "pwr_w": ${currentEnergy},
  "target_c": ${targetTemp},
  "target_w": ${targetEnergy},
  "gap_c": ${indoorGap},
  "status": "${currentGapVal > 2 ? 'WARN_THERMAL_RISK' : 'OK'}"
}`}
              </pre>
            </div>
            <div className="p-5 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest">Incoming AI Command</div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  <span className={`text-[10px] font-mono ${wsConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                    {wsConnected ? 'LIVE' : 'DISCONNECTED'}
                  </span>
                </div>
              </div>
              {agentCommand ? (
                <pre className="text-[11px] leading-relaxed text-emerald-300 whitespace-pre-wrap overflow-x-auto flex-1">
{`{
  "action":    "${agentCommand.action}",
  "label":     "${agentCommand.label}",
  "reason":    "${agentCommand.reason.slice(0, 70)}",
  "ac_power":  ${agentCommand.ac_power.toFixed(2)},
  "fan_power": ${agentCommand.fan_power.toFixed(2)},
  "draw_w":    ${agentCommand.cooling_draw_w},
  "reward":    ${agentCommand.reward.toFixed(3)},
  "avg_r10":   ${agentCommand.avg_reward_10.toFixed(3)}
}`}
                </pre>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 py-4">
                  <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_#f59e0b]"></div>
                  <div className="text-xs text-gray-400 text-center leading-relaxed">
                    {wsConnected ? 'Connected — waiting for first tick...' : 'Waiting for Python agent...'}<br />
                    <span className="text-[10px] text-gray-600">run: python main.py</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}