import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Radio, Play, ChevronDown } from "lucide-react";
import { calculateCountdown } from "@/config/festival";

// Target event timestamp: 20 Nov 2026 00:00:00 IST (+05:30)
const COUNTDOWN_TARGET = "2026-11-20T00:00:00+05:30";

export const RetroTelevisionHero: React.FC = () => {
  const containerRef = useRef<HTMLElement>(null);
  const [channelIndex, setChannelIndex] = useState(2); // Starts on CH-03
  const [screenEffect, setScreenEffect] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Countdown state
  const [countdown, setCountdown] = useState(() =>
    calculateCountdown(COUNTDOWN_TARGET)
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(calculateCountdown(COUNTDOWN_TARGET));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Subtle mouse parallax tracking (only if prefers-reduced-motion is not set)
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 16;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 16;
      setMousePos({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const channels = [
    { num: "01", name: "SCIENCE ARENA", themeAccent: "#4549D8" },
    { num: "02", name: "ANIMATION EXPO", themeAccent: "#FF873D" },
    { num: "03", name: "SUPERNOVA BROADCAST", themeAccent: "#D5F542" },
    { num: "04", name: "COLLEGIATE ESPORTS", themeAccent: "#A9D9F4" },
  ];

  const handleChannelClick = () => {
    setScreenEffect(true);
    setChannelIndex((prev) => (prev + 1) % channels.length);
    setTimeout(() => {
      setScreenEffect(false);
    }, 220);
  };

  const handleScrollToExplore = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById("about") || document.getElementById("experiences");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const currentChannel = channels[channelIndex];

  return (
    <section
      ref={containerRef}
      id="home"
      className="relative overflow-hidden bg-[#FAF9F4] min-h-[92vh] sm:min-h-screen flex flex-col items-center justify-center pt-8 sm:pt-12 md:pt-14 pb-14 sm:pb-16 border-b-2 border-[#191936]"
      aria-label="Supernova Broadcast Hero"
    >
      {/* 1. Surrounding Atmospheric Dot Grid Background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: "radial-gradient(#191936 1.2px, transparent 1.2px)",
          backgroundSize: "28px 28px",
        }}
        aria-hidden="true"
      />

      {/* 2. Floating Geometric Shapes (Framing the TV with safe margins, zero overlap on content) */}
      {/* Top Left: 3D Isometric Cube in Fresh Lime */}
      <div
        className="absolute top-16 left-[3%] lg:left-[6%] pointer-events-none hidden md:block transition-transform duration-300 ease-out z-0"
        style={{
          transform: `translate3d(${mousePos.x * -0.6}px, ${mousePos.y * -0.6}px, 0)`,
        }}
        aria-hidden="true"
      >
        <div style={{ animation: "floatSlow 6s ease-in-out infinite" }}>
          <svg width="58" height="58" viewBox="0 0 100 100" fill="none" className="drop-shadow-[3px_3px_0px_#191936]">
            <polygon points="50,10 90,32 50,55 10,32" fill="#D5F542" stroke="#191936" strokeWidth="4" />
            <polygon points="10,32 50,55 50,95 10,72" fill="#BCE032" stroke="#191936" strokeWidth="4" />
            <polygon points="50,55 90,32 90,72 50,95" fill="#A8CC25" stroke="#191936" strokeWidth="4" />
          </svg>
        </div>
      </div>

      {/* Top Right: Starburst Badge in Electric Blue & Lime */}
      <div
        className="absolute top-20 right-[3%] lg:right-[6%] pointer-events-none hidden md:block transition-transform duration-300 ease-out z-0"
        style={{
          transform: `translate3d(${mousePos.x * 0.7}px, ${mousePos.y * 0.7}px, 0)`,
        }}
        aria-hidden="true"
      >
        <div style={{ animation: "floatSlow 7s ease-in-out infinite 0.8s" }}>
          <div className="w-12 h-12 bg-[#4549D8] border-2 border-[#191936] rounded-xl rotate-12 flex items-center justify-center shadow-[3px_3px_0px_#191936]">
            <Sparkles size={20} className="text-[#D5F542]" />
          </div>
        </div>
      </div>

      {/* Mid Left Outline Diamond */}
      <div
        className="absolute top-1/2 -translate-y-1/2 left-[2%] lg:left-[4%] pointer-events-none hidden xl:block transition-transform duration-400 ease-out z-0"
        style={{
          transform: `translate3d(${mousePos.x * -0.4}px, ${mousePos.y * -0.4}px, 0)`,
        }}
        aria-hidden="true"
      >
        <div style={{ animation: "floatSlow 8.5s ease-in-out infinite 1.2s" }}>
          <div className="w-8 h-8 border-3 border-[#4549D8] rotate-45 rounded-sm shadow-[2px_2px_0px_#191936]" />
        </div>
      </div>

      {/* Mid Right Geometric Wireframe Ring */}
      <div
        className="absolute top-1/2 -translate-y-1/2 right-[2%] lg:right-[4%] pointer-events-none hidden xl:block transition-transform duration-400 ease-out z-0"
        style={{
          transform: `translate3d(${mousePos.x * 0.4}px, ${mousePos.y * 0.4}px, 0)`,
        }}
        aria-hidden="true"
      >
        <div style={{ animation: "floatSlow 7.8s ease-in-out infinite 0.5s" }}>
          <div className="w-9 h-9 rounded-full border-3 border-dashed border-[#191936] bg-[#FAF9F4]" />
        </div>
      </div>

      {/* Bottom Left: Ring & Sphere in Sky Blue */}
      <div
        className="absolute bottom-20 left-[4%] lg:left-[7%] pointer-events-none hidden lg:block transition-transform duration-300 ease-out z-0"
        style={{
          transform: `translate3d(${mousePos.x * 0.5}px, ${mousePos.y * 0.5}px, 0)`,
        }}
        aria-hidden="true"
      >
        <div style={{ animation: "floatSlow 8s ease-in-out infinite 1.8s" }}>
          <div className="w-10 h-10 rounded-full border-3 border-[#191936] bg-[#A9D9F4] shadow-[3px_3px_0px_#191936] flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-[#191936]" />
          </div>
        </div>
      </div>

      {/* Bottom Right: Date Pill Badge */}
      <div
        className="absolute bottom-24 right-[4%] lg:right-[7%] pointer-events-none hidden lg:block transition-transform duration-300 ease-out z-0"
        style={{
          transform: `translate3d(${mousePos.x * -0.5}px, ${mousePos.y * -0.5}px, 0)`,
        }}
        aria-hidden="true"
      >
        <div style={{ animation: "floatSlow 6.5s ease-in-out infinite 1.4s" }}>
          <div className="px-3.5 py-1.5 rounded-full bg-[#C8B9F5] border-2 border-[#191936] font-mono text-[11px] font-bold text-[#191936] shadow-[3px_3px_0px_#191936]">
            20-21 NOV 2026
          </div>
        </div>
      </div>

      {/* 3. Central Hero Composition (Balanced 900–1020px maximum width) */}
      <div className="w-full max-w-[980px] lg:max-w-[1020px] px-2.5 sm:px-6 relative z-10 flex flex-col items-center">
        
        {/* Symmetrical Rabbit-Ear Antenna Assembly */}
        <div className="relative z-0 flex items-end justify-center gap-16 sm:gap-24 -mb-1 pointer-events-none select-none">
          {/* Left Antenna Stem */}
          <div className="relative origin-bottom -rotate-[26deg] sm:-rotate-[30deg]">
            <div className="w-2 sm:w-2.5 h-14 sm:h-20 bg-gradient-to-t from-[#BCE032] via-[#EAE7DC] to-[#FFFFFF] border-2 border-[#191936] rounded-t-full shadow-xs" />
            <div className="w-4 h-4 rounded-full bg-[#4549D8] border-2 border-[#191936] absolute -top-2.5 -left-1 shadow-[1px_1px_0px_#191936]" />
          </div>

          {/* Central Mount Bracket */}
          <div className="w-12 sm:w-14 h-3 bg-[#191936] rounded-t-md border-t-2 border-x-2 border-[#191936] flex items-center justify-center">
            <div className="w-5 h-1 bg-[#D5F542] rounded-full" />
          </div>

          {/* Right Antenna Stem */}
          <div className="relative origin-bottom rotate-[26deg] sm:rotate-[30deg]">
            <div className="w-2 sm:w-2.5 h-14 sm:h-20 bg-gradient-to-t from-[#BCE032] via-[#EAE7DC] to-[#FFFFFF] border-2 border-[#191936] rounded-t-full shadow-xs" />
            <div className="w-4 h-4 rounded-full bg-[#D5F542] border-2 border-[#191936] absolute -top-2.5 -left-1 shadow-[1px_1px_0px_#191936]" />
          </div>
        </div>

        {/* MAIN RETRO TELEVISION CASING */}
        {/* Warm Cream (#EAE7DC), 4px Ink Navy outline (#191936), Crisp 3D shadow */}
        <div
          className="w-full bg-[#EAE7DC] border-3 sm:border-4 border-[#191936] rounded-[22px] sm:rounded-[36px] md:rounded-[40px] p-2 sm:p-5 md:p-6 shadow-[5px_5px_0px_#191936] sm:shadow-[10px_10px_0px_#191936] relative z-10 transition-transform duration-200"
          style={{
            transform: `perspective(1000px) rotateY(${mousePos.x * 0.04}deg) rotateX(${mousePos.y * -0.04}deg)`,
          }}
        >
          {/* Top Channel Header Strip */}
          <div className="flex items-center justify-between pb-2 sm:pb-3 px-1 select-none">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#191936]/40" />
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#191936]/40" />
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-0.5 bg-[#191936] text-[#D5F542] rounded-full border border-[#191936] shadow-xs">
              <Radio size={10} className="animate-pulse text-[#D5F542]" />
              <span className="font-mono text-[9px] sm:text-[11px] font-bold tracking-widest uppercase">
                SUPERNOVA BROADCAST CH-{currentChannel.num}
              </span>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#191936]/40" />
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#191936]/40" />
            </div>
          </div>

          {/* Screen + Controls Layout:
              Desktop: Screen takes ~82% width, Controls take ~18%
              Mobile: Screen on top, clean horizontal control bar on bottom
          */}
          <div className="flex flex-col md:flex-row gap-3 sm:gap-4 items-stretch">
            
            {/* THE CRT SCREEN: Ink Navy background (#191936), Paper White typography (#FAF9F4) */}
            <div className="flex-1 relative bg-[#191936] border-2 sm:border-4 border-[#191936] rounded-[16px] sm:rounded-[26px] p-3 sm:p-6 md:p-7 overflow-hidden flex flex-col justify-between shadow-inner">
              
              {/* Subtle CRT Scanline Overlay */}
              <div
                className="absolute inset-0 pointer-events-none z-20 opacity-15"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.4) 0px, rgba(0, 0, 0, 0.4) 1px, transparent 1px, transparent 3px)",
                }}
                aria-hidden="true"
              />

              {/* CRT Glass Glare Effect */}
              <div
                className="absolute inset-0 pointer-events-none z-20 rounded-[14px] sm:rounded-[24px]"
                style={{
                  boxShadow: "inset 0 0 50px rgba(0,0,0,0.6)",
                  background: "radial-gradient(ellipse at 85% 15%, rgba(255,255,255,0.08) 0%, transparent 60%)",
                }}
                aria-hidden="true"
              />

              {/* Static Tuning Flash */}
              {screenEffect && (
                <div
                  className="absolute inset-0 z-30 bg-white/25 pointer-events-none animate-pulse"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(45deg, #191936 0, #191936 2px, #FFFFFF 2px, #FFFFFF 5px)",
                  }}
                />
              )}

              {/* Internal Screen Ambient Lighting */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-25 z-0" aria-hidden="true">
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[#4549D8] blur-2xl" />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-[#D5F542] blur-3xl opacity-30" />
              </div>

              {/* SCREEN CONTENT HIERARCHY */}
              <div className="relative z-10 flex flex-col items-center text-center">
                
                {/* 1. Institutional Introduction (Text only, strictly single line for NES and PRESENTS below) */}
                <div className="mb-2 sm:mb-2.5 text-center">
                  <p className="font-heading text-[clamp(8.5px,2.4vw,13px)] font-bold text-[#FAF9F4]/90 tracking-[0.06em] sm:tracking-[0.18em] uppercase leading-snug whitespace-nowrap">
                    THE NATIONAL EDUCATION SOCIETY OF KARNATAKA
                  </p>
                  <p className="font-heading text-[clamp(8px,1.9vw,11px)] font-extrabold text-[#D5F542] tracking-[0.2em] sm:tracking-[0.25em] uppercase mt-1">
                    PRESENTS
                  </p>
                </div>

                {/* 2. Main Event Identity: SUPERNOVA 3.0 (Bricolage Grotesque) */}
                <div className="my-2 sm:my-3.5 w-full flex items-center justify-center">
                  <img
                    src="/assets/aistudio/Futuristic_Supernova_3.0_Logo_png_c0ddbd5c.png"
                    alt="SUPERNOVA 3.0"
                    className="h-11 sm:h-18 md:h-22 lg:h-26 w-auto max-w-[88%] sm:max-w-[85%] object-contain brightness-0 invert drop-shadow-[0_4px_16px_rgba(69,73,216,0.6)]"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <h1 className="sr-only">SUPERNOVA 3.0</h1>
                </div>

                {/* 3. Main Theme: CREATE. CONNECT. CELEBRATE. (Balanced wrapping, high readability) */}
                <div className="my-1.5 sm:my-2.5 text-center">
                  <h2 className="font-display font-extrabold text-[clamp(1.02rem,4.2vw,2.3rem)] tracking-tight leading-tight text-white select-none whitespace-nowrap">
                    <span className="text-[#4549D8] inline-block mr-1.5 sm:mr-3">CREATE.</span>
                    <span className="text-[#FF873D] inline-block mr-1.5 sm:mr-3">CONNECT.</span>
                    <span className="text-[#D5F542] inline-block">CELEBRATE.</span>
                  </h2>
                </div>

                {/* 4. Supporting Statement */}
                <p className="font-body text-[clamp(11px,2.4vw,14px)] text-[#FAF9F4]/90 max-w-md mx-auto leading-relaxed mb-3 sm:mb-4 px-2 font-normal">
                  From the technology that shaped us to the creativity shaping tomorrow.
                </p>

                {/* 5. Event Dates & Location */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 mb-3.5 sm:mb-5 w-full max-w-full">
                  <div className="px-2.5 sm:px-3 py-1 rounded-md bg-[#4549D8] text-white font-heading font-extrabold text-[10px] sm:text-[12px] uppercase tracking-wider shadow-xs whitespace-nowrap">
                    20–21 NOVEMBER 2026
                  </div>
                  <div className="px-2.5 sm:px-3 py-1 rounded-md bg-[#FAF9F4]/10 text-[#FAF9F4] border border-[#FAF9F4]/20 font-body text-[10px] sm:text-[12px] font-medium tracking-wide text-center">
                    THE NATIONAL COLLEGE, BASAVANAGUDI, BENGALURU
                  </div>
                </div>

                {/* 6. Integrated Countdown Cards: PAPER WHITE WITH INK NAVY TEXT */}
                <div className="w-full max-w-[340px] sm:max-w-[430px] mx-auto mb-4 sm:mb-5 p-1.5 sm:p-2.5 rounded-xl bg-[#FAF9F4]/10 border border-[#FAF9F4]/20 backdrop-blur-xs">
                  <div className="flex items-center justify-between px-1.5 pb-1 mb-1.5 border-b border-[#FAF9F4]/10 text-[9px] sm:text-[10px] font-mono text-[#D5F542] tracking-wider uppercase">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#D5F542] animate-ping" />
                      LIVE COUNTDOWN // T-MINUS
                    </span>
                    <span className="text-[#FAF9F4]/70">IST (UTC+05:30)</span>
                  </div>

                  {/* 4 Equal-Width Units in Paper White with Ink Navy text */}
                  <div className="grid grid-cols-4 gap-1.5 sm:gap-2 text-center">
                    {[
                      { label: "DAYS", val: countdown.days },
                      { label: "HOURS", val: countdown.hours },
                      { label: "MINUTES", val: countdown.minutes },
                      { label: "SECONDS", val: countdown.seconds },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="bg-[#FAF9F4] rounded-lg py-1 px-0.5 sm:py-2 border sm:border-2 border-[#191936] shadow-[1.5px_1.5px_0px_#191936] sm:shadow-[2px_2px_0px_#191936] flex flex-col items-center justify-center min-w-0"
                      >
                        <span className="font-mono text-base sm:text-2xl font-black text-[#191936] tabular-nums leading-none">
                          {String(item.val).padStart(2, "0")}
                        </span>
                        <span className="font-heading text-[8px] sm:text-[10px] font-bold text-[#4549D8] tracking-wider uppercase mt-0.5 sm:mt-1 truncate w-full text-center">
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 7. Action Buttons Inside the Television */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 w-full max-w-[280px] sm:max-w-none mx-auto">
                  {/* Secondary Button: Paper White (#FAF9F4) */}
                  <a
                    href="#about"
                    onClick={handleScrollToExplore}
                    className="inline-flex items-center justify-center gap-2 h-10 sm:h-[48px] px-5 sm:px-6 rounded-full bg-[#FAF9F4] text-[#191936] font-heading font-extrabold text-xs sm:text-sm uppercase tracking-wider border-2 border-[#191936] shadow-[2px_2px_0px_#191936] hover:bg-white hover:shadow-[3px_3px_0px_#191936] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer whitespace-nowrap"
                    aria-label="Explore the Event"
                  >
                    <span>EXPLORE THE EVENT</span>
                    <ChevronDown size={14} strokeWidth={2.5} />
                  </a>

                  {/* Primary Button: Fresh Lime (#D5F542) */}
                  <Link
                    to="/register"
                    className="inline-flex items-center justify-center gap-2 h-10 sm:h-[48px] px-5 sm:px-6 rounded-full bg-[#D5F542] text-[#191936] font-heading font-extrabold text-xs sm:text-sm uppercase tracking-wider border-2 border-[#191936] shadow-[2px_2px_0px_#191936] hover:bg-[#E2FF4A] hover:shadow-[3px_3px_0px_#191936] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer whitespace-nowrap"
                    aria-label="Register Now"
                  >
                    <span>REGISTER NOW</span>
                    <Play size={12} fill="#191936" />
                  </Link>
                </div>
              </div>
            </div>

            {/* VINTAGE RETRO TV CONTROLS:
                Reduced width on desktop (~15-18%), neatly aligned, simplified speaker louvers
                On mobile: Stacks as clean horizontal bar
            */}
            <div className="md:w-[140px] lg:w-[150px] flex-shrink-0 flex flex-row md:flex-col justify-between items-center md:items-stretch bg-[#DED9CD] border-2 sm:border-4 border-[#191936] rounded-[16px] sm:rounded-[22px] p-2.5 sm:p-4 shadow-inner gap-2 sm:gap-3">
              
              {/* Rotary Channel Knob */}
              <div className="flex flex-col items-center text-center">
                <span className="hidden md:block font-mono text-[9px] font-bold text-[#191936] uppercase tracking-wider mb-1.5">
                  CHANNEL
                </span>

                <button
                  type="button"
                  onClick={handleChannelClick}
                  className="relative w-11 h-11 sm:w-16 sm:h-16 rounded-full bg-[#FAF9F4] border-2 sm:border-4 border-[#191936] shadow-[2px_2px_0px_#191936] sm:shadow-[2.5px_2.5px_0px_#191936] hover:shadow-[3.5px_3.5px_0px_#191936] active:translate-y-0.5 transition-all flex items-center justify-center cursor-pointer group"
                  aria-label={`Change Channel (Current: Channel ${currentChannel.num})`}
                  title="Click to Switch Channel"
                >
                  {/* Rotary Notch */}
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center transition-transform duration-300"
                    style={{ transform: `rotate(${channelIndex * 90}deg)` }}
                  >
                    <div className="w-1.5 h-4 sm:h-6 bg-[#191936] rounded-full -translate-y-2.5 sm:-translate-y-3.5" />
                  </div>

                  <span className="absolute inset-0 flex items-center justify-center font-mono font-black text-xs sm:text-sm text-[#191936]">
                    {currentChannel.num}
                  </span>
                </button>
                
                <span className="font-heading text-[9px] font-bold text-[#4549D8] uppercase mt-1">
                  TUNE
                </span>
              </div>

              {/* Simplified Speaker Louvers (Clean horizontal slits) */}
              <div className="flex-1 md:flex-initial flex flex-col gap-1.5 justify-center px-2 sm:px-1 max-w-[120px] md:max-w-none">
                <div className="w-full h-1 bg-[#191936]/40 rounded-full" />
                <div className="w-full h-1 bg-[#191936]/40 rounded-full" />
                <div className="w-full h-1 bg-[#191936]/40 rounded-full" />
                <div className="w-full h-1 bg-[#191936]/40 rounded-full" />
              </div>

              {/* Bottom Controls: Signal & Power LED */}
              <div className="flex flex-row md:flex-col gap-2 items-center md:items-stretch">
                {/* Power Status & LED */}
                <div className="flex items-center justify-center gap-1.5 bg-[#191936] text-white px-2.5 py-1.5 rounded-lg border border-[#191936]">
                  <span className="w-2 h-2 rounded-full bg-[#D5F542] shadow-[0_0_6px_#D5F542] animate-pulse" />
                  <span className="font-mono text-[9px] font-bold text-[#FAF9F4]">PWR</span>
                </div>
              </div>

            </div>
          </div>

          {/* Symmetrical Pedestal Feet */}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-28 sm:gap-36 pointer-events-none select-none">
            <div className="w-10 sm:w-12 h-3 bg-[#191936] rounded-b-md border-2 border-[#191936]" />
            <div className="w-10 sm:w-12 h-3 bg-[#191936] rounded-b-md border-2 border-[#191936]" />
          </div>
        </div>
      </div>

      {/* Downward Scroll Cue */}
      <div className="mt-8 sm:mt-10 flex flex-col items-center relative z-10">
        <a
          href="#about"
          onClick={handleScrollToExplore}
          className="flex flex-col items-center gap-1 text-xs font-heading font-bold text-[#191936]/70 hover:text-[#4549D8] transition-colors select-none group"
        >
          <span className="uppercase tracking-widest text-[10px]">SCROLL TO EXPLORE</span>
          <div className="w-6 h-6 rounded-full bg-white border-2 border-[#191936] shadow-[1.5px_1.5px_0px_#191936] flex items-center justify-center transition-transform group-hover:translate-y-0.5">
            <ChevronDown size={13} strokeWidth={2.5} />
          </div>
        </a>
      </div>

      {/* Global subtle float keyframes */}
      <style>{`
        @keyframes floatSlow {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-8px);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          * {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
};
