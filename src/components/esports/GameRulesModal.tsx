import React, { useState } from "react";
import { 
  X, 
  ShieldAlert, 
  CheckCircle, 
  AlertTriangle, 
  Scale, 
  Clock, 
  Ban, 
  ExternalLink, 
  Gamepad2, 
  Smartphone, 
  Monitor,
  HelpCircle,
  Award
} from "lucide-react";

export interface GameRuleData {
  id: "valorant" | "bgmi" | "freefire";
  title: string;
  subtitle: string;
  publisher: string;
  platform: "PC" | "Mobile";
  genre: string;
  accentColor: string;
  badgeBg: string;
  officialRulebookUrl: string;
  officialRulebookTitle: string;
  teamSize: string;
  mapPool: string;
  format: string;
  scoring: string;
}

export const GAME_RULES_DATA: Record<string, GameRuleData> = {
  valorant: {
    id: "valorant",
    title: "VALORANT",
    subtitle: "Tactical 5v5 Character-Based FPS",
    publisher: "Riot Games",
    platform: "PC",
    genre: "5v5 Tactical Shooter (PC)",
    accentColor: "#FF4655",
    badgeBg: "rgba(255, 70, 85, 0.15)",
    officialRulebookUrl: "https://playvalorant.com",
    officialRulebookTitle: "Riot Games VALORANT Global Competition Policy & Community Code",
    teamSize: "5 Main Players + 1 Optional Substitute",
    mapPool: "Active Competitive Pool (Ascent, Bind, Haven, Sunset, Lotus)",
    format: "Single-elimination preliminary qualifiers into double-elimination semi-finals and grand finals",
    scoring: "Standard MR12 (First to 13 rounds with 2-round overtime rule)",
  },
  bgmi: {
    id: "bgmi",
    title: "BATTLEGROUNDS MOBILE INDIA",
    subtitle: "Squad Battle Royale Championship",
    publisher: "KRAFTON",
    platform: "Mobile",
    genre: "Squad Battle Royale (Mobile)",
    accentColor: "#F5A623",
    badgeBg: "rgba(245, 166, 35, 0.15)",
    officialRulebookUrl: "https://www.battlegroundsmobileindia.com",
    officialRulebookTitle: "KRAFTON Official BATTLEGROUNDS MOBILE INDIA Esports Rulebook",
    teamSize: "4 Squad Members + 1 Optional Substitute",
    mapPool: "Official Tournament Rotation: Erangel (Day), Miramar, Sanhok",
    format: "Multi-lobby survival qualifiers leading to the Grand Finale lobby series",
    scoring: "Official 10-Point Scoring Matrix: 1 pt per finish + 10 pts for WWCD (1st: 10, 2nd: 6, 3rd: 5, 4th: 4, 5th: 3, 6th: 2, 7th: 1, 8th+: 0)",
  },
  freefire: {
    id: "freefire",
    title: "FREE FIRE MAX",
    subtitle: "High-Tempo Tactical Mobile Survival",
    publisher: "Garena",
    platform: "Mobile",
    genre: "Fast-Paced Battle Royale (Mobile)",
    accentColor: "#FF6A00",
    badgeBg: "rgba(255, 106, 0, 0.15)",
    officialRulebookUrl: "https://ff.garena.com",
    officialRulebookTitle: "Garena Free Fire Official Competitive Rulebook & Integrity Standards",
    teamSize: "4 Squad Members + 1 Optional Substitute",
    mapPool: "Official Tournament Rotation: Bermuda, Purgatory, Kalahari",
    format: "High-cadence battle royale bracket lobbies culminating in the Stage Showcase",
    scoring: "Official Points Matrix: 1 pt per kill + placement points (1st: 12, 2nd: 9, 3rd: 8, 4th: 7, 5th: 6, 6th: 5, 7th: 4, 8th: 3, 9th: 2, 10th: 1)",
  },
};

interface GameRulesModalProps {
  gameId: "valorant" | "bgmi" | "freefire";
  isOpen: boolean;
  onClose: () => void;
}

export const GameRulesModal: React.FC<GameRulesModalProps> = ({ gameId, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<
    "overview" | "eligibility" | "allowed" | "prohibited" | "fairplay" | "conduct" | "disqualification"
  >("overview");

  if (!isOpen) return null;

  const data = GAME_RULES_DATA[gameId] || GAME_RULES_DATA.valorant;
  const isMobile = data.platform === "Mobile";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-modal-title"
      className="fixed inset-0 z-[999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 pt-20 sm:pt-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#191936] text-white border-2 border-white/20 rounded-[24px] max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.6)] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          className="p-5 sm:p-6 border-b border-white/10 relative flex items-start justify-between gap-4"
          style={{
            background: `linear-gradient(135deg, ${data.accentColor}15 0%, #191936 100%)`,
          }}
        >
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className="px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border"
                style={{
                  backgroundColor: data.badgeBg,
                  color: data.accentColor,
                  borderColor: `${data.accentColor}50`,
                }}
              >
                {data.genre}
              </span>
              <span className="flex items-center gap-1 font-mono text-[11px] text-white/70 bg-white/10 px-2 py-0.5 rounded-full">
                {isMobile ? <Smartphone size={12} /> : <Monitor size={12} />}
                <span>{data.platform} Division</span>
              </span>
              <span className="font-mono text-[11px] text-[#D5F542] bg-[#D5F542]/10 border border-[#D5F542]/30 px-2 py-0.5 rounded-full">
                Supernova Esports 2.0
              </span>
            </div>

            <h2 id="rules-modal-title" className="font-display text-2xl sm:text-3xl font-black text-white mt-1">
              {data.title} — Official Tournament Rules & Regulations
            </h2>
            <p className="font-body text-xs sm:text-sm text-white/90 mt-1">
              Authorized rulebook published by the Supernova 3.0 Esports Technical Committee in alignment with {data.publisher} standards.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center hover:bg-white/20 transition-colors shrink-0 cursor-pointer"
            aria-label="Close rules modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-white/10 bg-[#12122B] overflow-x-auto no-scrollbar">
          {[
            { id: "overview", label: "1. Overview", icon: Gamepad2 },
            { id: "eligibility", label: "2. Eligibility", icon: CheckCircle },
            { id: "allowed", label: "3. Allowed Gameplay", icon: CheckCircle },
            { id: "prohibited", label: "4. Prohibited Actions", icon: Ban },
            { id: "fairplay", label: "5. Fair Play", icon: Scale },
            { id: "conduct", label: "6. Match Conduct", icon: Clock },
            { id: "disqualification", label: "7. Disqualification", icon: ShieldAlert },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? "bg-[#4549D8] text-white shadow-sm"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={13} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-7 overflow-y-auto space-y-6 flex-1 text-sm leading-relaxed">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-mono text-xs uppercase tracking-wider text-[#D5F542] font-bold">
                    Official Tournament Specification
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    <AlertTriangle size={12} />
                    Fixture Brackets: Awaiting Organiser Confirmation
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
                  <div className="p-3 rounded-xl bg-black/30 border border-white/5">
                    <span className="text-white/50 block font-mono uppercase text-[10px]">Team Roster Format</span>
                    <strong className="text-white text-sm">{data.teamSize}</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-black/30 border border-white/5">
                    <span className="text-white/50 block font-mono uppercase text-[10px]">Official Map Rotation</span>
                    <strong className="text-white text-sm">{data.mapPool}</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-black/30 border border-white/5">
                    <span className="text-white/50 block font-mono uppercase text-[10px]">Tournament Structure</span>
                    <span className="text-white text-xs">{data.format}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-black/30 border border-white/5">
                    <span className="text-white/50 block font-mono uppercase text-[10px]">Scoring Matrix</span>
                    <span className="text-white text-xs">{data.scoring}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-display text-base font-bold text-white flex items-center gap-2">
                  <Award size={16} className="text-[#D5F542]" />
                  Tournament Governance & Authority
                </h4>
                <p className="text-white/80 text-xs sm:text-sm">
                  Supernova Esports 2.0 operates under two concurrent governing authorities: the localized tournament rules established by The National Education Society of Karnataka (Supernova Technical Committee) and the official competitive code established by {data.publisher}. Where localized policies are silent, the publisher’s global esports standards take full precedence.
                </p>
                <div className="p-3 rounded-xl bg-[#4549D8]/20 border border-[#4549D8]/40 flex items-start gap-2.5">
                  <ExternalLink size={16} className="text-[#A9D9F4] shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-semibold text-white">Official Publisher Reference Rulebook:</p>
                    <a
                      href={data.officialRulebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#D5F542] hover:underline font-mono inline-flex items-center gap-1 mt-0.5"
                    >
                      <span>{data.officialRulebookTitle}</span>
                      <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ELIGIBILITY */}
          {activeTab === "eligibility" && (
            <div className="space-y-4 animate-fadeIn">
              <h3 className="font-display text-lg font-bold text-white">Player & Squad Eligibility Criteria</h3>
              <p className="text-white/80 text-xs sm:text-sm">
                Participation in Supernova Esports 2.0 is strictly reserved for verified students representing educational institutions across Karnataka.
              </p>

              <div className="space-y-2.5">
                {[
                  "Enrolled Student Status: All roster members must be full-time enrolled students of a recognized school, pre-university college (PUC), or degree college/university in Karnataka.",
                  "Mandatory Physical Student ID: Each registered participant must present their original, valid institutional student ID card with photograph at the tournament check-in desk.",
                  "Verified Roster Submission: Squad rosters must be registered prior to the published registration deadline. Roster changes within 24 hours of match start require express written consent from the head tournament marshal.",
                  "Age & Guardian Authorization: School student participants (under 18 years of age) must have parental or institutional guardian approval to compete in on-stage broadcasted matches.",
                  "Single-Roster Commitment: A player may only represent ONE team across the entire tournament. Ringing, ghosting, or playing on multiple rosters is strictly prohibited.",
                  "Designated Team Captain: Each squad must maintain an active team captain who serves as the sole liaison for room credentials, scheduling notifications, and official appeals.",
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                    <CheckCircle size={16} className="text-[#D5F542] shrink-0 mt-0.5" />
                    <span className="text-xs sm:text-sm text-white/90">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: ALLOWED GAMEPLAY */}
          {activeTab === "allowed" && (
            <div className="space-y-4 animate-fadeIn">
              <h3 className="font-display text-lg font-bold text-white">Allowed Hardware, Peripherals & Client Settings</h3>
              <p className="text-white/80 text-xs sm:text-sm">
                To preserve competitive fairness and authentic esports performance, the following technical allowances are defined:
              </p>

              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[#D5F542] mb-1.5">
                    1. Official Game Clients Only
                  </h4>
                  <p className="text-xs text-white/80">
                    {data.platform === "PC"
                      ? "Only the official Riot Games client running on Windows 10/11 with Vanguard anti-cheat active is allowed. No beta clients or modded localization files."
                      : "Only the official game client downloaded directly from the Google Play Store or Apple App Store is permitted. Sideloaded APKs or third-party app stores are strictly barred."}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[#D5F542] mb-1.5">
                    2. Approved Input Devices & Peripherals
                  </h4>
                  <p className="text-xs text-white/80">
                    {data.platform === "PC"
                      ? "Players may bring their own wired mouse, standard mechanical keyboard, mousepad, and standard 3.5mm or USB wired headset. Mice with onboard memory are subject to referee inspection for macro scripting."
                      : "Competition must take place exclusively on standard smartphones or tablets via native touchscreen. Authorized fabric mobile gaming finger sleeves are permitted. Hardware clip-on triggers, cooler attachment buttons, gamepads, or OTG controllers are strictly prohibited."}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[#D5F542] mb-1.5">
                    3. In-Game Configuration & Customization
                  </h4>
                  <p className="text-xs text-white/80">
                    Players are free to customize their in-game sensitivity, control layout (HUD layout), crosshair settings, graphic quality settings, and audio balances through the official game menus. Config (.ini) file editing is prohibited.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PROHIBITED ACTIONS */}
          {activeTab === "prohibited" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs">
                <ShieldAlert size={18} className="shrink-0" />
                <span>
                  <strong>Strict Zero-Tolerance Code:</strong> Any violation in this section results in immediate team disqualification, tournament expulsion, and institutional notification.
                </span>
              </div>

              <h3 className="font-display text-lg font-bold text-white">Explicitly Prohibited Conduct & Unfair Practices</h3>

              <div className="space-y-2.5">
                {[
                  {
                    title: "Cheating, Hacking & Memory Tampering",
                    desc: "Use of aimbots, triggerbots, wallhacks, radar hacks, speed hacks, ESP, recoil control scripts, macro keybinds, or any background process interacting with game memory.",
                  },
                  {
                    title: "Modified Clients & Unauthorized APKs",
                    desc: "Any tampered, modded, or patched client. For mobile titles, rooted Android devices running Magisk/Xposed or jailbroken iOS devices with substrate hooks are banned.",
                  },
                  {
                    title: "Strict Emulator Prohibition for Mobile Titles",
                    desc: "For BGMI and Free Fire, playing on any PC emulator (including Gameloop, BlueStacks, LDPlayer, Nox, MEMu) is strictly prohibited. Matches must be played solely on physical mobile devices.",
                  },
                  {
                    title: "Map Glitches & Bug Exploitation",
                    desc: "Intentionally abusing out-of-bounds terrain, invisible collision textures, one-way textures, weapon animations cancellation exploits, or known geometry bugs.",
                  },
                  {
                    title: "Collusion, Match-Fixing & Teaming",
                    desc: "Conspiring with opposing squads to manipulate bracket outcomes, sharing match intelligence, intentionally throwing rounds, or teaming in battle royale lobbies.",
                  },
                  {
                    title: "Toxic Conduct, Abuse & Hate Speech",
                    desc: "Verbal or written abuse, vulgar slurs, harassment, discriminatory language, or provocative gestures directed at players, officials, casters, or spectators.",
                  },
                  {
                    title: "Account Sharing & Ringer Players",
                    desc: "Allowing an unverified individual or non-registered player to play on an official account. Match impersonation constitutes immediate institutional fraud.",
                  },
                  {
                    title: "Unauthorized Substitutions",
                    desc: "Swapping roster members during an ongoing map or series without prior written authorization from the lead tournament marshal.",
                  },
                ].map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-black/40 border border-red-500/30 flex items-start gap-3">
                    <Ban size={16} className="text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-mono text-xs font-bold text-white uppercase tracking-wide">{item.title}</h4>
                      <p className="text-xs text-white/90 mt-1 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: FAIR PLAY */}
          {activeTab === "fairplay" && (
            <div className="space-y-4 animate-fadeIn">
              <h3 className="font-display text-lg font-bold text-white">Fair Play, Sportsmanship & Dispute Arbitration</h3>
              <p className="text-white/80 text-xs sm:text-sm">
                Supernova Esports 2.0 is designed to celebrate authentic collegiate camaraderie. The integrity of the game supersedes all competitive rivalries.
              </p>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                  <Scale size={18} className="text-[#D5F542] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-mono text-xs font-bold text-[#D5F542] uppercase">Referee Authority</h4>
                    <p className="text-xs text-white/80 mt-1">
                      Tournament Referees and Match Marshals possess sole on-field authority to adjudicate all in-game situations. Referees may pause, restart, or rule on rounds in real-time. All referee decisions are final and binding on the spot.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                  <Clock size={18} className="text-[#D5F542] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-mono text-xs font-bold text-[#D5F542] uppercase">Official Dispute Lodging (10-Minute Window)</h4>
                    <p className="text-xs text-white/80 mt-1">
                      To protest a match result or report an unfair practice, the verified team captain must submit a formal dispute to the Head Tournament Marshal within 10 minutes of match completion. Protests must contain video recordings, match logs, or screenshot timestamps. Informal disputes after this window will be dismissed.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                  <AlertTriangle size={18} className="text-[#D5F542] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-mono text-xs font-bold text-[#D5F542] uppercase">Technical Timeouts & Hardware Malfunctions</h4>
                    <p className="text-xs text-white/80 mt-1">
                      In PC matches (VALORANT), each squad is entitled to one technical pause of up to 3 minutes per map for confirmed hardware, peripheral, or network failure. For mobile titles, technical pauses are not supported during active battle royale survival drops.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: MATCH CONDUCT */}
          {activeTab === "conduct" && (
            <div className="space-y-4 animate-fadeIn">
              <h3 className="font-display text-lg font-bold text-white">Match Day Protocol & Conduct</h3>
              <p className="text-white/80 text-xs sm:text-sm">
                Smooth execution of the tournament requires all participating squads to follow disciplined match day schedules.
              </p>

              <div className="space-y-2.5">
                {[
                  {
                    step: "Reporting Time (15 Minutes Prior)",
                    detail: "All squad members and the team captain must assemble at the Tournament Control Desk or designated digital staging channel at least 15 minutes before their scheduled match time.",
                  },
                  {
                    step: "Grace Period & Default Forfeiture",
                    detail: "A strict 10-minute grace period is provided from official call time. If a squad fails to enter the custom lobby with the required roster count after 10 minutes, a default loss (forfeit) is automatically awarded to the opposing team.",
                  },
                  {
                    step: "Room IDs & Password Confidentiality",
                    detail: "Lobby codes and credentials provided by officials are strictly confidential. Any player or squad that broadcasts, leaks, or shares room credentials with unauthorized persons will be instantly disqualified.",
                  },
                  {
                    step: "Early Disconnection & Match Remake Protocol",
                    detail: "If a player disconnects before the first engagement (first round or within 60 seconds of initial drop) due to verified server failure, a match remake may be ordered at the head marshal's sole discretion. Disconnections after the first casualty will proceed without pause.",
                  },
                  {
                    step: "Post-Match Screenshot Verification",
                    detail: "Both team captains must take end-game score screen screenshots and submit them to the match official to verify kill counts and placement rankings.",
                  },
                ].map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                    <span className="font-mono text-xs font-bold text-[#D5F542] w-6 shrink-0 mt-0.5">#{idx + 1}</span>
                    <div>
                      <h4 className="font-mono text-xs font-bold text-white uppercase">{item.step}</h4>
                      <p className="text-xs text-white/80 mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: DISQUALIFICATION */}
          {activeTab === "disqualification" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-xl bg-red-900/30 border-2 border-red-500/50 text-white space-y-2">
                <div className="flex items-center gap-2 text-red-300 font-display font-bold text-base">
                  <ShieldAlert size={20} />
                  <span>Sanctions & Disqualification Protocol</span>
                </div>
                <p className="text-xs text-white/90">
                  Infractions against the Supernova 3.0 code of conduct are reviewed directly by the Festival Academic Steering Committee and lead tournament marshals.
                </p>
              </div>

              <h4 className="font-mono text-xs font-bold text-[#D5F542] uppercase tracking-wider">
                Levels of Penalties Enforced:
              </h4>

              <div className="space-y-2.5">
                {[
                  {
                    level: "Level 1: Official Warning & Round Forfeiture",
                    text: "Issued for minor tardiness, mild unsportsmanlike language, or failure to follow referee staging instructions. May include a one-round or points penalty.",
                  },
                  {
                    level: "Level 2: Match Forfeiture & Series Loss",
                    text: "Applied for unauthorized substitutions, unverified peripherals, or refusal to follow match instructions.",
                  },
                  {
                    level: "Level 3: Full Tournament Disqualification",
                    text: "Applied for cheating, script usage, emulators on mobile titles, account sharing, toxicity, harassment, or intentional match throw. The squad is completely expelled from the tournament.",
                  },
                  {
                    level: "Level 4: Institutional Sanctions & Multi-Year Ban",
                    text: "In cases of severe cheating, fraud, or egregious misconduct, all prize eligibility, certificates, and trophies are revoked. An official notice of misconduct will be submitted to the Principal/Dean of the offending student's registered college.",
                  },
                ].map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <span className="font-mono text-xs font-bold text-red-400 block mb-0.5">{item.level}</span>
                    <span className="text-xs text-white/80">{item.text}</span>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs text-white/70">
                <div className="flex items-center gap-1.5">
                  <HelpCircle size={14} className="text-[#A9D9F4]" />
                  <span>Questions regarding rules or technical arbitration?</span>
                </div>
                <span className="font-mono text-[#D5F542] font-semibold">Helpdesk: animationthenationalcollege@gmail.com</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-[#12122B] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <span className="w-2 h-2 rounded-full bg-[#D5F542]" />
            <span>Supernova 3.0 · The National College, Basavanagudi</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <a
              href={data.officialRulebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-full border border-white/20 text-xs font-mono font-bold text-white hover:bg-white/10 transition-colors inline-flex items-center gap-1.5"
            >
              <span>{data.publisher} Rulebook</span>
              <ExternalLink size={12} />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-full bg-[#D5F542] text-[#191936] text-xs font-heading font-extrabold uppercase tracking-wider hover:bg-[#c4e339] transition-colors cursor-pointer"
            >
              I Understand & Agree
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
