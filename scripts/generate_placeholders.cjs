const fs = require('fs');
const path = require('path');

function createSvgPlaceholder(title, subtitle, accentColor, iconSvg, width = 800, height = 500) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0A0B1F" />
      <stop offset="50%" stop-color="#14143F" />
      <stop offset="100%" stop-color="#0E0F2B" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.35" />
      <stop offset="60%" stop-color="${accentColor}" stop-opacity="0.08" />
      <stop offset="100%" stop-color="#0A0B1F" stop-opacity="0" />
    </radialGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(248, 246, 241, 0.04)" stroke-width="1" />
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#bg)" />
  <rect width="100%" height="100%" fill="url(#grid)" />
  <circle cx="${width/2}" cy="${height/2 - 20}" r="${Math.min(width, height) * 0.45}" fill="url(#glow)" />

  <!-- Thematic Center Illustration -->
  <g transform="translate(${width/2 - 40}, ${height/2 - 70}) scale(1.6)" stroke="${accentColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
    ${iconSvg}
  </g>

  <!-- Labeling -->
  <text x="${width/2}" y="${height/2 + 55}" text-anchor="middle" font-family="'Unbounded', -apple-system, sans-serif" font-weight="800" font-size="20" fill="#F8F6F1" letter-spacing="0.04em">
    ${title}
  </text>
  <text x="${width/2}" y="${height/2 + 85}" text-anchor="middle" font-family="'Inter', -apple-system, sans-serif" font-weight="500" font-size="13" fill="rgba(248, 246, 241, 0.65)" letter-spacing="0.08em">
    ${subtitle.toUpperCase()}
  </text>

  <!-- Supernova Badge Chip -->
  <rect x="24" y="24" width="130" height="28" rx="14" fill="rgba(248, 246, 241, 0.08)" stroke="rgba(248, 246, 241, 0.15)" />
  <text x="89" y="42" text-anchor="middle" font-family="'Inter', -apple-system, sans-serif" font-weight="700" font-size="10" fill="#F8F6F1" letter-spacing="0.06em">
    SUPERNOVA 3.0
  </text>
</svg>`;
}

const ICONS = {
  science: `<path d="M9 3h6M10 9h4M10 3v6l-4 9a2 2 0 0 0 1.7 3h8.6a2 2 0 0 0 1.7-3l-4-9V3"/><circle cx="10" cy="15" r="1" fill="#3B5BFF"/><circle cx="14" cy="17" r="1.5" fill="#5EEAD4"/>`,
  animation: `<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m10 8 6 4-6 4V8z"/><path d="M2 8h20M2 16h20"/>`,
  esports: `<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M6 12h4M8 10v4M15 11h.01M17 13h.01"/>`,
  ideas: `<path d="M12 2a7 7 0 0 0-4 12.8V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.2A7 7 0 0 0 12 2zM9 21h6"/>`,
  rocket: `<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><circle cx="15.5" cy="8.5" r="1.5"/>`,
  stars: `<path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07 19.07 4.93"/>`,
  trophy: `<path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2M4 5h16v6a6 6 0 0 1-12 0V5zM12 17v4M8 21h8"/>`,
  atom: `<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/>`
};

const items = [
  // Home zones
  { path: 'public/assets/images/home/hero-nebula.svg', title: 'Ignition Deep Space', subtitle: 'Festival Atmosphere', color: '#3B5BFF', icon: ICONS.stars, w: 1200, h: 675 },
  { path: 'public/assets/images/events/science/science-main.svg', title: 'Science Expo', subtitle: 'Flagship Zone 01', color: '#3B5BFF', icon: ICONS.science, w: 800, h: 500 },
  { path: 'public/assets/images/events/animation/animation-main.svg', title: 'Animation Showcase', subtitle: 'Flagship Zone 02', color: '#FF6B4A', icon: ICONS.animation, w: 800, h: 500 },
  { path: 'public/assets/images/events/esports/esports-main.svg', title: 'Esports Tournament', subtitle: 'Flagship Zone 03', color: '#8B5CF6', icon: ICONS.esports, w: 800, h: 500 },
  { path: 'public/assets/images/events/ideas/ideas-main.svg', title: 'Ideas in Motion', subtitle: 'Flagship Zone 04', color: '#5EEAD4', icon: ICONS.ideas, w: 800, h: 500 },

  // Home moments
  { path: 'public/assets/images/home/moment-1.svg', title: 'Robotics Rover Demo', subtitle: 'Science Quadrangle', color: '#3B5BFF', icon: ICONS.science, w: 640, h: 480 },
  { path: 'public/assets/images/home/moment-2.svg', title: 'Animation Screening', subtitle: 'Centenary Auditorium', color: '#FF6B4A', icon: ICONS.animation, w: 640, h: 480 },
  { path: 'public/assets/images/home/moment-3.svg', title: 'Battle Station Finals', subtitle: 'Arena Main Stage', color: '#8B5CF6', icon: ICONS.esports, w: 640, h: 480 },
  { path: 'public/assets/images/home/moment-4.svg', title: 'Laser Optics Wave Demo', subtitle: 'Physics Lab Bench', color: '#FFD54A', icon: ICONS.atom, w: 640, h: 480 },
  { path: 'public/assets/images/home/moment-5.svg', title: 'Concept Art Workshop', subtitle: 'Design Studio Lab', color: '#5EEAD4', icon: ICONS.ideas, w: 640, h: 480 },
  { path: 'public/assets/images/home/moment-6.svg', title: 'Campus Quadrangle Crowd', subtitle: 'The National College', color: '#3B5BFF', icon: ICONS.rocket, w: 640, h: 480 },

  // About
  { path: 'public/assets/images/about/campus-heritage.svg', title: 'The National College', subtitle: 'Heritage Campus Quadrangle', color: '#3B5BFF', icon: ICONS.stars, w: 960, h: 540 },
  { path: 'public/assets/images/about/about-students.svg', title: 'Student Research Lab', subtitle: 'Collegiate Innovators', color: '#FF6B4A', icon: ICONS.science, w: 500, h: 500 },
  { path: 'public/assets/images/about/about-technology.svg', title: 'Prototype Testing', subtitle: 'Hardware Engineering', color: '#8B5CF6', icon: ICONS.ideas, w: 640, h: 480 },
  { path: 'public/assets/images/about/about-art.svg', title: 'Animation Department', subtitle: 'Creative Showcase', color: '#5EEAD4', icon: ICONS.animation, w: 640, h: 480 },

  // Gallery
  { path: 'public/assets/images/gallery/gallery-1.svg', title: 'Robotics Arm Showcase', subtitle: 'Science Pavilion', color: '#3B5BFF', icon: ICONS.science, w: 640, h: 480 },
  { path: 'public/assets/images/gallery/gallery-2.svg', title: 'Character Sculpting Reel', subtitle: 'Animation Department', color: '#FF6B4A', icon: ICONS.animation, w: 640, h: 480 },
  { path: 'public/assets/images/gallery/gallery-3.svg', title: 'Tournament Arena Stage', subtitle: 'Esports Championship', color: '#8B5CF6', icon: ICONS.esports, w: 640, h: 480 },
  { path: 'public/assets/images/gallery/gallery-4.svg', title: 'Smart Grid Solar Solution', subtitle: 'Ideas in Motion', color: '#5EEAD4', icon: ICONS.ideas, w: 640, h: 480 },
  { path: 'public/assets/images/gallery/gallery-5.svg', title: 'Optical Wave Experiment', subtitle: 'Physics Lab', color: '#FFD54A', icon: ICONS.atom, w: 640, h: 480 },
  { path: 'public/assets/images/gallery/gallery-6.svg', title: 'Sci-Fi Metropolis Art', subtitle: 'Animation Gallery', color: '#FF6B4A', icon: ICONS.animation, w: 640, h: 480 },
  { path: 'public/assets/images/gallery/gallery-7.svg', title: 'Trophy Ceremony', subtitle: 'Grand Stage', color: '#8B5CF6', icon: ICONS.trophy, w: 640, h: 480 },
  { path: 'public/assets/images/gallery/gallery-8.svg', title: 'Rocket Aerodynamics', subtitle: 'Junior Challenge', color: '#3B5BFF', icon: ICONS.rocket, w: 640, h: 480 },

  // Updates
  { path: 'public/assets/images/updates/update-schedule.svg', title: '2-Day Timetable Released', subtitle: 'Official Programme', color: '#3B5BFF', icon: ICONS.stars, w: 640, h: 400 },
  { path: 'public/assets/images/updates/update-esports.svg', title: 'Esports Bracket Final Call', subtitle: 'Competitive Registration', color: '#8B5CF6', icon: ICONS.esports, w: 640, h: 400 },
  { path: 'public/assets/images/updates/update-expo.svg', title: 'Science Stall Guidelines', subtitle: 'Exhibitor Information', color: '#FF6B4A', icon: ICONS.science, w: 640, h: 400 },
];

items.forEach(item => {
  const fullPath = path.resolve(__dirname, '..', item.path);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, createSvgPlaceholder(item.title, item.subtitle, item.color, item.icon, item.w, item.h));
});

console.log('Successfully generated', items.length, 'placeholder SVGs');
