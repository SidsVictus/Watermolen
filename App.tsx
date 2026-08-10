/*Copyright 2026 [WaterMelon]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://apache.org

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/



import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Label
} from 'recharts';
import {
  Download, Moon, Sun, Thermometer, Zap, Activity,
  Cpu, Wind, Droplets, Eye, CloudRain, AlertCircle
} from 'lucide-react';


interface DataPoint {
  time: string; temp: number; energy: number; target: number;
  outdoor: number; humidity: number; windSpeed: number; airQuality: number; rain: number;
}

const OUTDOOR_TEMP = 32.5;

const generateInitialData = (targetTemp: number): DataPoint[] => {
  const data: DataPoint[] = [];
  let currentTemp = 30; let currentEnergy = 1450;
  for (let i = -19; i <= 0; i++) {
    const time = new Date(Date.now() + i * 10000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const diff = targetTemp - currentTemp;
    currentTemp = parseFloat((currentTemp + diff * 0.15 + (Math.random() * 0.5 - 0.25)).toFixed(2));
    currentEnergy = parseFloat(Math.max(currentEnergy - Math.random() * 45, 420 + Math.random() * 80).toFixed(2));
    data.push({ time, temp: currentTemp, energy: currentEnergy, target: targetTemp, outdoor: OUTDOOR_TEMP,
      humidity: parseFloat((44 + Math.random() * 6).toFixed(1)), windSpeed: parseFloat((10 + Math.random() * 8).toFixed(1)),
      airQuality: parseFloat((40 + Math.random() * 20).toFixed(1)), rain: parseFloat((Math.random() * 5).toFixed(2)) });
  }
  return data;
};

const WIND_DIRECTIONS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const getWindDir = () => WIND_DIRECTIONS[Math.floor(Math.random() * WIND_DIRECTIONS.length)];
const getMoistureCondition = (rain: number, humidity: number) => {
  if (rain > 3) return 'Heavy Rain'; if (rain > 1) return 'Light Rain';
  if (humidity > 65) return 'Humid'; if (humidity > 50) return 'Moderate'; return 'Dry';
};
const getAQLabel = (aqi: number) => {
  if (aqi < 50) return { label: 'Good', bad: false };
  if (aqi < 100) return { label: 'Moderate', bad: false };
  return { label: 'Poor', bad: true };
};

// ── Slider with floating bubble marker ────────────────────────────────────────
const SliderWithMarker = ({
  min, max, step, value, onChange, trackColor, thumbColor, fillColor, label
}: {
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
  trackColor: string; thumbColor: string; fillColor: string; label: string;
}) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ position: 'relative', width: '100%', paddingTop: 36 }}>
      {/* Bubble marker */}
      <div style={{
        position: 'absolute', top: 0, left: `calc(${pct}% - 20px)`,
        backgroundColor: thumbColor, color: '#fff', fontSize: 11, fontWeight: 700,
        padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none',
        boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
        transition: 'left 0.05s',
      }}>
        {label}
        {/* Triangle pointer */}
        <div style={{
          position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
          borderTop: `5px solid ${thumbColor}`,
        }} />
      </div>
      {/* Track */}
      <div style={{ position: 'relative', height: 6, borderRadius: 3, backgroundColor: trackColor }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, backgroundColor: fillColor, borderRadius: 3 }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            position: 'absolute', top: '50%', transform: 'translateY(-50%)',
            width: '100%', height: '100%', opacity: 0, cursor: 'pointer', margin: 0, padding: 0,
          }}
        />
        {/* Custom thumb circle */}
        <div style={{
          position: 'absolute', top: '50%', left: `calc(${pct}% - 9px)`,
          transform: 'translateY(-50%)',
          width: 18, height: 18, borderRadius: '50%',
          backgroundColor: thumbColor,
          border: `2px solid rgba(255,255,255,0.3)`,
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          pointerEvents: 'none', transition: 'left 0.05s',
        }} />
      </div>
    </div>
  );
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
    action: string; reason: string; ac_power: number; fan_power: number;
    cooling_draw_w: number; label: string; reward: number; avg_reward_10: number;
  } | null>(null);

  useEffect(() => {
    const envUrl = (import.meta as any)?.env?.VITE_WS_URL;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.hostname;
    const WS_URL = envUrl || `${proto}://${host}:8765`;
    let ws: WebSocket; let reconnectTimer: ReturnType<typeof setTimeout>;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let attempts = 0;
    const startFallback = () => {
      if (fallbackTimer) return;
      console.warn('WebSocket: fallback engaged — starting simulated updates');
      // simple Plan B: run triggerNextTick periodically so dashboard remains active
      fallbackTimer = setInterval(() => triggerNextTick(), 5000);
    };
    const stopFallback = () => { if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; } };

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => { attempts = 0; stopFallback(); setWsConnected(true); };
      ws.onmessage = (evt) => {
        try {
          const d = JSON.parse(evt.data);
          if (d.action) setAgentCommand({ action: d.action, reason: d.reason ?? '', ac_power: d.ac_power ?? 0,
            fan_power: d.fan_power ?? 0, cooling_draw_w: d.cooling_draw_w ?? 0, label: d.label ?? '',
            reward: d.reward ?? 0, avg_reward_10: d.avg_reward_10 ?? 0 });
          if (d.outdoor_temp_c !== undefined) {
            setData(prev => { if (!prev.length) return prev; const last = prev[prev.length - 1];
              return [...prev.slice(0, -1), { ...last, outdoor: d.outdoor_temp_c,
                humidity: d.humidity_pct ?? last.humidity, windSpeed: d.wind_kmh ?? last.windSpeed,
                airQuality: d.aqi ?? last.airQuality, rain: d.rain_mm ?? last.rain }]; });
            setWindDir(d.wind_dir ?? windDir);
          }
        } catch { }
      };
      ws.onclose = () => {
        setWsConnected(false); setAgentCommand(null);
        attempts += 1;
        console.error(`WebSocket closed (attempt ${attempts}). Will retry.`);
        if (attempts >= 3) {
          console.error('WebSocket: failed to connect after 3 attempts — entering Plan B fallback.');
          startFallback();
        }
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = (e) => { console.error('WebSocket error', e); ws.close(); };
    };
    connect();
    return () => { clearTimeout(reconnectTimer); stopFallback(); ws?.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [decisions, setDecisions] = useState([
    { tag: 'ac_high',   label: 'too hot',         score: '0.61', good: false },
    { tag: 'ac_high',   label: 'still climbing',  score: '0.65', good: false },
    { tag: 'ac_medium', label: 'tried medium',    score: '0.78', good: true  },
    { tag: 'ac_medium', label: 'worked well',     score: '0.81', good: true  },
    { tag: 'ac_medium', label: 'optimal balance', score: '0.81', good: true  },
  ]);

  const triggerNextTick = useCallback(() => {
    setWindDir(getWindDir());
    setData((prev) => {
      const last = prev[prev.length - 1];
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const newTemp = parseFloat((last.temp + (targetTemp - last.temp) * 0.2 + (Math.random() * 0.4 - 0.2)).toFixed(2));
      const newEnergy = parseFloat(Math.min(1500, Math.max(300, last.energy + (targetEnergy - last.energy) * 0.15 + (Math.random() * 30 - 15))).toFixed(2));
      const gapNow = Math.abs(newTemp - targetTemp);
      let newTag: string, newLabel: string, newScore: string, newGood: boolean;
      if (gapNow > 5)        { newTag = 'ac_high';   newLabel = 'too hot';         newScore = (0.45 + Math.random() * 0.2).toFixed(2);  newGood = false; }
      else if (gapNow > 3)   { newTag = 'ac_high';   newLabel = 'still climbing';  newScore = (0.55 + Math.random() * 0.15).toFixed(2); newGood = false; }
      else if (gapNow > 1.5) { newTag = 'ac_medium'; newLabel = 'tried medium';    newScore = (0.70 + Math.random() * 0.1).toFixed(2);  newGood = true;  }
      else if (gapNow > 0.5) { newTag = 'ac_medium'; newLabel = 'worked well';     newScore = (0.78 + Math.random() * 0.1).toFixed(2);  newGood = true;  }
      else                   { newTag = 'fan_only';  newLabel = 'optimal balance';  newScore = (0.85 + Math.random() * 0.1).toFixed(2);  newGood = true;  }
      setDecisions(p => [...p.slice(-4), { tag: newTag, label: newLabel, score: newScore, good: newGood }]);
      return [...prev.slice(-19), { time, temp: newTemp, energy: newEnergy, target: targetTemp, outdoor: OUTDOOR_TEMP,
        humidity: parseFloat((44 + Math.random() * 6).toFixed(1)), windSpeed: parseFloat((10 + Math.random() * 8).toFixed(1)),
        airQuality: parseFloat((40 + Math.random() * 20).toFixed(1)), rain: parseFloat((Math.random() * 5).toFixed(2)) }];
    });
  }, [targetTemp, targetEnergy]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(p => { if (p <= 1) { triggerNextTick(); return 10; } return p - 1; });
    }, 1000);
    return () => clearInterval(timer);
  }, [triggerNextTick]);

  const handleExport = () => {
    const h1 = ['timestamp','temp_controls','','','energy_controls','','','outdoor_conditions','','','','',''].join(',');
    const h2 = ['time','indoor_temp','outdoor_temp','target_temp','temp_gap','current_energy_w','target_energy_w','energy_gap_w','outdoor_temp_c','humidity_pct','wind_kmh','wind_dir','aqi','rain_mm'].join(',');
    const rows = data.map(r => [r.time,r.temp,OUTDOOR_TEMP,targetTemp,(r.temp-targetTemp).toFixed(2),r.energy,targetEnergy,(r.energy-targetEnergy).toFixed(0),OUTDOOR_TEMP,r.humidity,r.windSpeed,windDir,r.airQuality.toFixed(0),r.rain].join(','));
    const blob = new Blob([[h1,h2,...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'autonomous_sensor_data.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const latestData        = data[data.length - 1];
  const outdoorHumidity   = latestData?.humidity ?? 47;
  const outdoorWind       = latestData?.windSpeed ?? 12;
  const outdoorAQ         = latestData?.airQuality ?? 55;
  const outdoorRain       = latestData?.rain ?? 0;
  const moistureCondition = getMoistureCondition(outdoorRain, outdoorHumidity);
  const aqInfo            = getAQLabel(outdoorAQ);
  const indoorGap         = latestData ? (latestData.temp - targetTemp).toFixed(1) : '0.0';
  const currentGapVal     = latestData ? Math.abs(latestData.temp - targetTemp) : 0;
  const currentEnergy     = latestData?.energy ?? 900;
  const energyGap         = (currentEnergy - targetEnergy).toFixed(0);

  const getAgentThoughts = () => {
    if (currentGapVal > 5) return { action: 'Action: Max Cooling', thought: `Gap is huge (${currentGapVal.toFixed(1)}°C). Spinning up secondary compressors to force thermal drop. Energy at ${currentEnergy}W.` };
    if (currentGapVal > 2) return { action: 'Action: AC Medium',   thought: `Moderate ${currentGapVal.toFixed(1)}°C gap. Modulating AC units to balance thermal load. Wind from ${windDir} at ${outdoorWind} km/h.` };
    return { action: 'Action: Fan Only', thought: `Only ${currentGapVal.toFixed(1)}°C gap. Fan only may suffice — testing energy-efficient option. AQI is ${outdoorAQ.toFixed(0)}, intake filters nominal.` };
  };
  const aiThought = getAgentThoughts();

  // ═══════════════════════════════════════════════════════════════════════════
  // PALETTE
  // DARK : bg=#23171d  text=#f4cba7 (ONE color for ALL text)  accent=#e46552
  //        card=#2e1e16  track=#4a3020  divider=#4a3020  termBg=#160e0b
  // LIGHT: bg=#ccc0b1  text=#212217 (ONE color for ALL text)  accent=#6a4420
  //        card=#b5a48a  track=#8a7458  divider=#8a7458  termBg=#1a0e08
  //        termText=#c8a87a (light brown — visible on dark terminal bg)
  // ═══════════════════════════════════════════════════════════════════════════
  const C = isDark ? {
    bg:       '#23171d',
    text:     '#f4cba7',   // ← single text color for EVERYTHING
    accent:   '#e46552',
    card:     '#2e1e16',
    track:    '#4a3020',
    divider:  '#4a3020',
    termBg:   '#160e0b',
    termText: '#f4cba7',  // same as text in dark
  } : {
    bg:       '#ccc0b1',
    text:     '#212217',   // ← single text color for EVERYTHING
    accent:   '#6a4420',
    card:     '#b5a48a',
    track:    '#8a7458',
    divider:  '#8a7458',
    termBg:   '#1a0e08',
    termText: '#c8a87a',  // light brown — visible on dark terminal bg
  };

  const T  = { color: C.text };       // all text
  const TA = { color: C.accent };     // accent only
  const TR = { color: '#ef4444' };    // red-only for errors

  return (
    <div style={{ backgroundColor: C.bg, color: C.text, minHeight: '100vh' }} className="transition-colors duration-300 p-4 md:p-6 font-sans">

      <div className="max-w-7xl mx-auto flex flex-col gap-8">

        {/* ── Header ── */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pb-5"
          style={{ borderBottom: `1px solid ${C.divider}` }}>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" style={T}>
              <Cpu size={22} style={TA} /> Project Zephyr
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            
            <button onClick={() => setIsDark(!isDark)} className="p-2 rounded-md hover:opacity-80 transition-opacity"
              style={{ backgroundColor: C.card }}>
              {isDark ? <Sun size={16} style={T} /> : <Moon size={16} style={T} />}
            </button>
            <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md hover:opacity-90 transition-colors"
              style={{ backgroundColor: C.accent, color: isDark ? '#1a0a06' : '#f4e8d0' }}>
              <Download size={14} /> Export CSV
            </button>
          </div>
        </header>

        {/* ── Row 1: Temp Controls + Gauge ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Temp Controls — NO card bg */}
          <div className="col-span-1 lg:col-span-2">
            <h2 className="text-[15px] font-semibold tracking-wider flex items-center gap-2 pb-10 mb-7" style={{ ...T, borderBottom: '1px solid currentColor', paddingBottom: '8px' }}>
              <Thermometer size={0}  style={TA} /> Temperature Controls
            </h2>
            <div className="grid grid-cols-3 gap-6 mb-6">
              {[
                { label: 'Indoor Temp',   value: `${latestData?.temp ?? '--'}°C` },
                { label: 'Target Temp',   value: `${targetTemp}.0°C` },
                { label: 'Gap to Target', value: `${Number(indoorGap)>0?'+':''}${indoorGap}°C` },
              ].map((item, i) => (
                <div key={i}>
                  <div className="text-[10px] mb-1 tracking-wide" style={T}>{item.label}</div>
                  <div className="text-2xl font-bold" style={T}>{item.value}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] mb-1 font-medium" style={TA}>
              <span>18°C — Extreme Cool</span>
              <span>30°C — Power Save</span>
            </div>
            <SliderWithMarker min={18} max={30} step={1} value={targetTemp} onChange={setTargetTemp}
              trackColor={C.track} thumbColor={C.accent} fillColor={C.text} label={`${targetTemp}°C`} />
          </div>

          {/*  Rack Temp gauge — NO card bg */}
          <div className="col-span-1 flex flex-col items-center justify-center">
            <h2 className="text-[15px] font-semibold tracking-wider flex items-center gap-2 mb-4" style={T}>
              <Thermometer size={14} style={TA} />  Rack Temp
            </h2>
            <div className="relative w-40 h-40">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke={C.track} strokeWidth="8" />
                <circle cx="50" cy="50" r="44" fill="none" stroke={C.accent} strokeWidth="8"
                  strokeDasharray={`${(Math.max(0,Math.min(latestData?.temp??0,30)-18)/(30-18))*276.4},276.4`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold" style={T}>{latestData?.temp} <span className="text-sm font-normal">°C</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 2: Energy Controls + Gauge ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="col-span-1 lg:col-span-2">
            <h2 className="text-[15px] font-semibold tracking-wider flex items-center gap-2 mb-7" style={{ ...T, borderBottom: '1px solid currentColor', paddingBottom: '8px' }}>
              <Zap size={0} style={TA} /> Energy Consumption Control
            </h2>
            <div className="grid grid-cols-3 gap-6 mb-6">
              {[
                { label: 'Current Consumption', value: `${currentEnergy} KW` },
                { label: 'Target Consumption',  value: `${targetEnergy} KW` },
                { label: 'Target Gap',          value: `${Number(energyGap)>0?'+':''}${energyGap} KW` },
              ].map((item, i) => (
                <div key={i}>
                  <div className="text-[10px] mb-1 tracking-wide" style={T}>{item.label}</div>
                  <div className="text-2xl font-bold" style={T}>{item.value}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] mb-1 font-medium" style={TA}>
              <span>300 W — Minimal</span>
              <span>1500 W — Full Load</span>
            </div>
            <SliderWithMarker min={300} max={1500} step={50} value={targetEnergy} onChange={setTargetEnergy}
              trackColor={C.track} thumbColor={C.accent} fillColor={C.text} label={`${targetEnergy}W`} />
          </div>

          {/* Live Power gauge — NO card bg */}
          <div className="col-span-1 flex flex-col items-center justify-center">
            <h2 className="text-[15px] font-semibold tracking-wider flex items-center gap-2 mb-10" style={T}>
              <Zap size={14} style={TA} />  Power
            </h2>
            <div className="relative w-40 h-40">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke={C.track} strokeWidth="8" />
                <circle cx="50" cy="50" r="44" fill="none" stroke={C.accent} strokeWidth="8"
                  strokeDasharray={`${(Math.min(currentEnergy,1500)/1500)*276.4},276.4`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold" style={T}>{currentEnergy}<span className="text-sm font-normal">W</span></span>
                <span className="text-[10px] mt-0.5" style={T}>Drawing </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 3: Outdoor Conditions — NO card bg ── */}
        <div>
          <h2 className="text-[15px] font-semibold tracking-wider flex items-center gap-2 mb-7" style={{ ...T, borderBottom: '1px solid currentColor', paddingBottom: '8px' }}>
            <Eye size={0} style={TA} /> Outdoor Conditions
            
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
            {[
              { icon: <Thermometer size={0} />, label: 'Outdoor',     value: `${OUTDOOR_TEMP}°C`,          sub: 'Ambient' },
              { icon: <Droplets    size={0} />, label: 'Humidity',    value: `${outdoorHumidity}%`,         sub: 'Relative' },
              { icon: <Wind        size={0} />, label: 'Wind',        value: `${outdoorWind} km/h`,         sub: `Dir: ${windDir}` },
              { icon: <Eye         size={0} />, label: 'Air Quality', value: `AQI ${outdoorAQ.toFixed(0)}`, sub: aqInfo.label, subBad: aqInfo.bad },
              { icon: <CloudRain   size={0} />, label: 'Rainfall',    value: `${outdoorRain} mm`,           sub: 'Last 10 min' },
              { icon: <Droplets    size={0} />, label: 'Moisture',    value: moistureCondition },
            ].map((item, i) => (
              <div key={i}>
                <div className="text-[10px] tracking-wide flex items-center gap-1 mb-1" style={T}>
                  <span style={T}>{item.icon}</span> {item.label}

                </div>
                <div className="text-lg font-bold" style={T}>{item.value}</div>
                {item.sub && <div className="text-[10px] mt-0.5 mb-5" style={item.subBad ? TR : T}>{item.sub}</div>}

              </div>
              
            ))}
            
          </div>
            <hr style={{ borderColor: C.text, borderTopWidth: 1, margin: '8px 0 20px 0', }} />

        </div>

        {/* ── Row 4: Agent + Decisions ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Agent — HAS card bg (only one in the whole dashboard) */}
          <div>
            <h2 className="text-[15px] font-semibold tracking-wider mb-4 flex items-center gap-2 mb-7" style={{ ...T, borderBottom: '1px solid currentColor', paddingBottom: '8px' }}>
              <Cpu size={14} style={TA} /> What Our Agent Says
            </h2>
            <div className="rounded-xl p-5 flex flex-col gap-3" style={{ backgroundColor: C.card }}>
              {wsConnected && agentCommand ? (
                <>
                  <div className="font-bold text-base" style={TA}>{aiThought.action}</div>
                  <div className="text-sm italic leading-relaxed" style={T}>&ldquo;{aiThought.thought}&rdquo;</div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <AlertCircle size={18} style={TR} />
                    <div className="font-semibold" style={T}>Agent Offline 💤</div>
                  </div>
                  <div className="text-sm leading-relaxed" style={T}>
                    I'm taking a nap due to some error. Please fix it to wake me up!
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Last 5 Decisions — NO card bg */}
          <div>
            <h2 className="text-[15px] font-semibold tracking-wider mb-4 flex items-center gap-2mb-7" style={{ ...T, borderBottom: '1px solid currentColor', paddingBottom: '8px' }}>
              <Activity size={0} style={TA} /> Last 5 Decisions
            </h2>
            <div className="flex flex-col">
              {decisions.map((d, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ backgroundColor: `${d.good ? C.text : C.accent}20`, color: d.good ? C.text : C.accent, border: `1px solid ${d.good ? C.text : C.accent}50` }}>
                        {d.tag}
                      </span>
                      <span className="text-sm" style={T}>{d.label}</span>
                    </div>
                    <span className="text-xs font-mono" style={d.good ? T : TA}>{d.score}</span>
                  </div>
                  {i < decisions.length - 1 && <div style={{ borderBottom: `1px solid ${C.divider}` }} />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Row 5: Charts — NO card bg ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 ">
          <div>
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-[15px] font-semibold tracking-wider" style={T}>Temperature Over Time</h3>
              <span className="text-[10px] flex items-center gap-1.5" style={T}>
                <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: C.text }} /> Ideal {targetTemp}°C
              </span>
            </div>
            <div style={{ width:'100%', height:160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top:8, right:12, left:5, bottom:0 }}>
                  <defs>
                    <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.accent} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs> 
                  <CartesianGrid strokeDasharray="3 3" stroke={C.track} vertical={false} />
                  <XAxis dataKey="time" hide />
<YAxis
  domain={[(min: number) => Math.floor(min) - 1, (max: number) => Math.ceil(max) + 1]}
  ticks={Array.from(
    { length: Math.ceil(Math.max(...data.map(d => d.temp))) - Math.floor(Math.min(...data.map(d => d.temp))) + 3 },
    (_, i) => Math.floor(Math.min(...data.map(d => d.temp))) - 1 + i
  )}
  stroke={C.text} tick={{ fontSize:10, fill:C.text }} width={42}
/>
<Tooltip contentStyle={{ backgroundColor:C.card, border:'none', color:C.text, fontSize:12, borderRadius:6 }} />
                  <ReferenceLine y={targetTemp} stroke={C.text} strokeDasharray="5 5" strokeWidth={1.5}>
                  </ReferenceLine>
                  <Area type="monotone" dataKey="temp" stroke={C.accent} strokeWidth={2} fillOpacity={1} fill="url(#tGrad)" isAnimationActive={true} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-[15px] font-semibold tracking-wider" style={T}>Energy Optimization</h3>
                <span className="text-[10px] flex items-center gap-1.5" style={T}>  
                  <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: C.text }} /> Ideal {targetEnergy} kWh
                </span>
            </div>
            <div style={{ width:'100%', height:160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top:8, right:12, left:5, bottom:0 }}>
                  <defs>
                    <linearGradient id="eGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.accent} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.track} vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={['auto','auto']} stroke={C.text} tick={{ fontSize:10, fill:C.text }} width={42} />
                  <Tooltip contentStyle={{ backgroundColor:C.card, border:'none', color:C.text, fontSize:12, borderRadius:6 }} />
                  <ReferenceLine y={targetEnergy} stroke={C.text} strokeDasharray="5 5" strokeWidth={1.5}>
                  </ReferenceLine>
                  <Area type="monotone" dataKey="energy" stroke={C.accent} strokeWidth={2} fillOpacity={1} fill="url(#eGrad)" isAnimationActive={true} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Row 6: Terminal — BLACK BORDER ── */}
        <div className="rounded-xl overflow-hidden font-mono" style={{ border: '1px solid #000000', backgroundColor: C.termBg }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #000000', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <span className="text-[11px] font-semibold tracking-widest" style={{ color: C.termText }}>
              {'›_ AGENT STREAMSOCKET '}
            </span>
            <div className="flex items-center gap-4">
              <span className="text-xs" style={{ color: C.termText }}>
                next payload in <strong style={{ color: C.termText }}>{countdown}s</strong>
              </span>
              <span className="flex items-center gap-1.5 text-[11px]" style={{ color: C.termText }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ backgroundColor: C.termText }} />
                
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="p-6">
              <div className="text-[15px] tracking-widest mb-4" style={{ color: C.termText, opacity: 0.6 }}>
                 Outgoing Sensor Payload
              </div>
              <pre className="text-[12px] leading-6 whitespace-pre-wrap overflow-x-auto" style={{ color: C.termText }}>
{`
  Sensor Id        :      Heat sensor #24,
  Indoor Temp      :      ${latestData?.temp}°C,
  Outdoor Temp     :     ${OUTDOOR_TEMP}°C,
  Humidity         :     ${outdoorHumidity}, 
  Wind Speed       :     ${outdoorWind}kmph,
  Wind Direction   :     ${windDir},
  AQI              :     ${outdoorAQ.toFixed(0)},
  Rain             :     ${outdoorRain} mm,
  Current energy   :     ${currentEnergy},
  Target temp      :     ${targetTemp},
  Target energy    :     ${targetEnergy},
  Gap              :     ${indoorGap},
`}
              </pre>
            </div>

            <div className="p-6 flex flex-col" style={{ borderLeft: '1px solid #000000' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="text-[15px] tracking-widest" style={{ color: C.termText, opacity: 0.6 }}>
                   Incoming AI Command
                </div>
                
              </div>
              {wsConnected && agentCommand ? (
                <pre className="text-[12px] leading-6 whitespace-pre-wrap overflow-x-auto flex-1" style={{ color: C.termText }}>
{`
  Action    :     ${agentCommand.action},
  Label     :     ${agentCommand.label},
  Reason    :     ${agentCommand.reason.slice(0, 60)},
  AC power  :     ${agentCommand.ac_power.toFixed(2)},
  Fan power :     ${agentCommand.fan_power.toFixed(2)},
  Draw W    :     ${agentCommand.cooling_draw_w},
  Reward    :     ${agentCommand.reward.toFixed(3)},
  Avg R10   :     ${agentCommand.avg_reward_10.toFixed(3)}
`}
                </pre>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <div className="text-sm text-center leading-relaxed" style={{ color: C.termText, opacity: 0.7 }}>
                    Agent is offline — waiting to be repaired...
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