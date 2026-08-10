import { useEffect, useRef } from 'react';
import {
  ArrowRight, Thermometer, Zap, Server, Cpu, Mail, Clock, Bot,
} from 'lucide-react';

const LINE_PX = 100;

interface HomePageProps { onEnter: () => void; }

const FEATURES = [
  { icon: Thermometer, title: '±0.1°C precision',      desc: 'Varied air conditioning systems for less, moderate and high loads.' },
  { icon: Zap,         title: 'High energy savings',   desc: 'Balances thermal load & power draw, cutting overconsumption.' },
  { icon: Cpu,         title: 'LLM as decision agent', desc: 'Implements a feedback-loop system for the most efficient prediction.' },
  { icon: Server,      title: 'Persistent memory',     desc: 'Caches all data and exports it on demand.' },
  { icon: Clock,       title: '~200ms latency',         desc: 'Instantaneous decision-making by the agent, for every cycle.' },
  { icon: Bot,         title: 'Self‑healing',           desc: 'Learning ML algorithms that predict and prevent high server loads.' },
];

const TIMELINE = [
  { year: 'The beginning', title: 'Created in a 36 hour challenge.',      desc: 'We chose what everyone in the room felt was hard - Intelligent Environment Controler with IoT.' },
  { year: 'The Journey',   title: 'Chaos in serenity.',                   desc: "It wasn't calmness amidst a storm, rather the opposite. It was a war of ideas in a tranquil environment." },
  { year: 'The Solution',  title: 'Self healing server room.',            desc: 'A dashboard run by an AI agent that excels at making predictive adjustments in every cycle.' },
  { year: 'The Reckoning', title: "Expectations couldn't meet results.", desc: "Unknown whether the cause was our project or our pitch, we couldn't hit the leaderboard. But that didn't mark our end." },
];

export default function HomePage({ onEnter }: HomePageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const heroBgRef  = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef   = useRef<HTMLDivElement>(null);
  const infoRef    = useRef<HTMLDivElement>(null);

  const maxV  = useRef(0);
  const maxH  = useRef(0);
  const sV    = useRef(0);   // actual vertical scroll position (smoothed)
  const sH    = useRef(0);   // actual horizontal scroll position (smoothed)
  const tV    = useRef(0);   // target vertical
  const tH    = useRef(0);   // target horizontal
  const mode  = useRef<'v' | 'h'>('v');
  const rafId = useRef<number>(0);

  const fades    = useRef<HTMLElement[]>([]);
  const imgSlots = useRef<HTMLElement[]>([]);

  // Reset scroll restoration
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    sV.current = 0; sH.current = 0;
    tV.current = 0; tH.current = 0;
    mode.current = 'v';
  }, []);

  // Measure max travel
  useEffect(() => {
    const measure = () => {
      const w = wrapperRef.current;
      const c = cardsRef.current;
      if (w) maxV.current = Math.max(0, w.offsetHeight - window.innerHeight);
      if (c) maxH.current = Math.max(0, c.scrollWidth - window.innerWidth);
    };
    measure();
    const t = setTimeout(measure, 400);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, []);

  // Cache animated elements
  useEffect(() => {
    const root = wrapperRef.current;
    if (!root) return;
    fades.current    = Array.from(root.querySelectorAll('.fade-up'))    as HTMLElement[];
    imgSlots.current = Array.from(root.querySelectorAll('.img-reveal')) as HTMLElement[];
  }, []);

  // (removed debug keyboard toggle and isMobile logs)

  // Paint functions
  const paintV = (y: number) => {
    if (!wrapperRef.current) return;
    wrapperRef.current.style.transform = `translateY(${-y}px)`;

    if (heroBgRef.current) {
      const s = 1 + Math.min(0.25, y / 800);
      const o = Math.max(0.15, 1 - y / 500);
      heroBgRef.current.style.transform = `scale(${s})`;
      heroBgRef.current.style.opacity   = String(o);
    }

    const vh        = window.innerHeight;
    const threshold = vh - 80;
    fades.current.forEach((el) => {
      if (!el.classList.contains('revealed') && el.getBoundingClientRect().top < threshold) {
        el.classList.add('revealed');
      }
    });
    imgSlots.current.forEach((el) => {
      if (!el.classList.contains('revealed') && el.getBoundingClientRect().top < vh - 60) {
        el.classList.add('revealed');
      }
    });
  };

  const paintH = (h: number) => {
    if (!cardsRef.current) return;
    cardsRef.current.style.transform = `translateX(${-h}px)`;
    if (infoRef.current) {
      const p = Math.min(1, h / 120);
      infoRef.current.style.opacity   = String(p);
      infoRef.current.style.transform = `translateY(${(1 - p) * 24}px)`;
    }
  };

  // RAF loop for smooth lerp
  useEffect(() => {
    const EASE = 0.14;
    const loop = () => {
      const dV = tV.current - sV.current;
      const dH = tH.current - sH.current;
      if (Math.abs(dV) > 0.01) { sV.current += dV * EASE; paintV(sV.current); }
      if (Math.abs(dH) > 0.01) { sH.current += dH * EASE; paintH(sH.current); }
      rafId.current = requestAnimationFrame(loop);
    };
    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // Wheel handler – updates target variables only
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const section = sectionRef.current;
    if (!wrapper || !section) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const sTop = section.offsetTop;
      const mV   = maxV.current;
      const mH   = maxH.current;

      const raw   = e.deltaMode === 1 ? e.deltaY * LINE_PX
                  : e.deltaMode === 2 ? e.deltaY * window.innerHeight
                  : e.deltaY;
      const delta = raw;
      const down  = delta > 0;
      const up    = delta < 0;

      if (mode.current === 'v') {
        let nextV = tV.current + delta;
        nextV = Math.max(0, Math.min(nextV, mV));

        // Switch to horizontal mode when entering product section
        if (down && tV.current < sTop && nextV >= sTop && tH.current < mH) {
          tV.current = sTop;
          sV.current = sTop; paintV(sTop);
          mode.current = 'h';
          return;
        }
        if (up && tV.current > sTop && nextV <= sTop && tH.current > 0) {
          tV.current = sTop;
          sV.current = sTop; paintV(sTop);
          mode.current = 'h';
          return;
        }

        tV.current = nextV;
      } else {
        let nextH = tH.current + delta;
        nextH = Math.max(0, Math.min(nextH, mH));

        // Switch back to vertical mode at boundaries
        if (down && nextH >= mH) {
          mode.current = 'v';
          tV.current = sTop + Math.abs(delta);
          sV.current = sTop; paintV(sTop);
          return;
        }
        if (up && nextH <= 0) {
          mode.current = 'v';
          tV.current = sTop - Math.abs(delta);
          sV.current = sTop; paintV(sTop);
          return;
        }

        tH.current = nextH;
      }
    };

    paintV(0); paintH(0);
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  const resetAndEnter = () => {
    tV.current = 0; sV.current = 0;
    tH.current = 0; sH.current = 0;
    mode.current = 'v';
    if (wrapperRef.current) wrapperRef.current.style.transform = 'translateY(0px)';
    if (cardsRef.current)   cardsRef.current.style.transform   = 'translateX(0px)';
    onEnter();
  };

  return (
    <>
      <style>{`
        html, body {
          overflow: hidden !important;
          height: 100%;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; }

        .fade-up {
          opacity: 0;
          transform: translateY(28px);
          transition: opacity 0.75s cubic-bezier(.22,1,.36,1),
                      transform 0.75s cubic-bezier(.22,1,.36,1);
        }
        .fade-up.revealed { opacity: 1; transform: translateY(0); }

        .img-reveal {
          opacity: 0;
          transform: translateY(24px) scale(0.97);
          transition: opacity 1.05s cubic-bezier(.22,1,.36,1),
                      transform 1.05s cubic-bezier(.22,1,.36,1);
        }
        .img-reveal.revealed { opacity: 1; transform: translateY(0) scale(1); }
      `}</style>

      <div
        ref={wrapperRef}
        style={{ position: 'fixed', top: 0, left: 0, width: '100%', minHeight: '100vh', willChange: 'transform', transform: 'translateY(0px)', overflowX: 'hidden' }}
        className="bg-[#e9d1ab] font-['Inter',system-ui] antialiased"
      >

        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <div className="relative h-screen w-full flex items-center justify-center overflow-hidden">
          <div ref={heroBgRef} className="absolute inset-0 w-full h-full bg-cover bg-center will-change-transform" style={{ backgroundImage: `url('/hp-bg.png')` }} />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[600px] h-[300px] rounded-full bg-[#372513]/40 blur-3xl" />
          </div>
          <div className="relative z-10 text-center px-6 max-w-3xl">
            <h1 className="fade-up text-4xl md:text-6xl font-medium text-white tracking-tight drop-shadow-lg">
              Project Zephyr
            </h1>
            <p className="fade-up text-lg md:text-xl text-white/90 mt-4 font-light" style={{ transitionDelay: '120ms' }}>
              Autonomous cooling for the next decade of compute.
            </p>
            <div className="fade-up mt-6 flex justify-center gap-3 text-white/60 text-sm" style={{ transitionDelay: '240ms' }}>
              <span>Environment-aware</span><span>·</span><span>AI‑driven</span><span>·</span><span>Energy‑aware</span>
            </div>
          </div>
        </div>

        {/* ── CARDS SECTION ─────────────────────────────────────────────── */}
        <div ref={sectionRef} className="relative h-screen w-full bg-[#e9d1ab]">
          <div ref={infoRef} className="absolute top-10 left-0 right-0 z-20 text-center px-6 pointer-events-none" style={{ opacity: 0, transform: 'translateY(24px)' }}>
            <span className="text-sm font-mono text-[#372513]/70 border-t-2 border-[#372513] pt-2 inline-block">PRODUCT</span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#372513] mt-5"> Self‑healing systems, brewed for efficiency. </h2>
            <p className="text-base text-[#372513]/70 max-w-2xl mx-auto mt-7 ">Inbuilt agent predicts thermal drift, adjusts cooling, and cuts energy waste - making it an automated cooling system that's as warm as a cup of caramel chocolate...</p>
          </div>
          <div className="absolute left-0 right-0 bottom-0 top-[240px] overflow-hidden flex items-center">
            <div ref={cardsRef} className="flex will-change-transform" style={{ transform: 'translateX(0px)' }}>
              <div className="w-[10vw] flex-shrink-0" />
              {FEATURES.map((feat, i) => (
                <div key={i} className="group flex-shrink-0 w-80 bg-white/20 backdrop-blur-sm rounded-3xl p-7 border border-white/30 shadow-xl mx-4 transition-transform duration-300 hover:scale-[1.03] hover:shadow-2xl">
                  <feat.icon className="w-10 h-10 text-[#372513] mb-4 transition-transform duration-300 group-hover:scale-110" />
                  <h3 className="text-xl font-bold text-[#372513] mb-2">{feat.title}</h3>
                  <p className="text-[#372513]/70 text-sm leading-relaxed">{feat.desc}</p>
                </div>
              ))}
              <div className="w-[10vw] flex-shrink-0" />
            </div>
          </div>
        </div>

        {/* ── ARTICLE ───────────────────────────────────────────────────── */}
        <div className="py-24 px-6 bg-[#372513]/10">
          <div className="max-w-5xl mx-auto">

            <div className="fade-up text-center mb-20">
              <span className="text-sm font-mono text-[#372513]/70 border-b-2 border-[#372513] pb-1">ARTICLE</span>
              <h2 className="text-4xl md:text-5xl font-bold text-[#372513] mt-4">Forged at ForgeInspira 2026</h2>
              <p className="text-lg text-[#372513]/70 mt-4 max-w-2xl mx-auto">
                A hackathon problem statement that became a vision for sustainable data centres.
              </p>
            </div>

            {/* Timeline */}
            <div className="relative">
              <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-[#372513]/20" />

              {TIMELINE.map((item, idx) => {
                const hasImage = idx < 3;
                return (
                  <div
                    key={idx}
                    className={`fade-up relative ${idx < 3 ? 'mb-20' : 'mb-16'}`}
                    style={{ transitionDelay: `${idx * 80}ms` }}
                  >
                    <div className="grid md:grid-cols-2 gap-8 items-start">
                      <div className={`${idx % 2 === 0 ? 'md:order-1' : 'md:order-2'}`}>
                        <div className="bg-white/40 backdrop-blur-sm rounded-2xl p-6 shadow-md">
                          <span className="text-sm font-mono text-[#372513] font-bold">{item.year}</span>
                          <h3 className="text-2xl font-bold text-[#372513] mt-1">{item.title}</h3>
                          <p className="text-[#372513]/80 mt-2 leading-relaxed">{item.desc}</p>
                        </div>
                      </div>

                      <div className={`${idx % 2 === 0 ? 'md:order-2' : 'md:order-1'}`}>
                        {hasImage && (
                          <div className="img-reveal rounded-2xl overflow-hidden aspect-video bg-[#372513]/5 border border-[#372513]/10 shadow-md flex items-center justify-center"
                            style={{ transitionDelay: `${idx * 80 + 180}ms` }}>
                            {idx === 0 && <img src="/1.jpg" alt="Event photo 1" className="w-full h-full object-cover" />}
                            {idx === 1 && <img src="/2.jpg" alt="Event photo 2" className="w-full h-full object-cover" />}
                            {idx === 2 && <img src="/3.jpg" alt="Event photo 3" className="w-full h-full object-cover" />}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="absolute left-2 md:left-1/2 top-4 w-4 h-4 rounded-full bg-[#372513] -translate-x-1/2" />
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <div className="py-10 px-6 bg-[#372513]/10">
          <div className="max-w-7xl mx-auto text-center">
            <button onClick={resetAndEnter} className="fade-up bg-[#372513] text-[#e9d1ab] px-12 py-5 rounded-full text-xl font-semibold hover:bg-[#4f351a] transition-colors shadow-xl inline-flex items-center gap-3 group">
              Head to the dashboard
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* ── FOOTER ────────────────────────────────────────────────────── */}
        <footer className="bg-[#372513] text-[#e9d1ab] py-12">
          <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <a href="https://mail.google.com/mail/u/0/?fs=1&tf=cm&source=mailto&su=Hello&to=sidsvictus@gmail.com&body" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white transition-colors">
              <Mail className="w-4 h-4" /> sidsvictus@gmail.com
            </a>
            <span className="text-sm">&copy; 2026 Project Zephyr. Open sourced under Apache 2.0 License.</span>
          </div>
        </footer>

      </div>
    </>
  );
}