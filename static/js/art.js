// ── Illustrations (inline SVG, no image files needed) ─────────
const Art = (() => {
  let uid = 0;
  const id = p => `${p}${++uid}`;

  // Deterministic pseudo-random so textures look hand-laid but never flicker
  const rng = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  function scene(inner, { sky = ['#d9eef2', '#f2faf6'] } = {}) {
    const g = id('sky');
    return `<svg viewBox="0 0 160 100" class="art" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
      <rect width="160" height="100" fill="url(#${g})"/>
      <circle cx="132" cy="20" r="9" fill="#fde7a8" opacity=".9"/>
      <path d="M0 86 Q40 80 80 84 T160 82 V100 H0Z" fill="#cde8d4"/>
      <circle cx="18" cy="70" r="11" fill="#9fd1ad"/><rect x="17" y="74" width="2.4" height="12" fill="#7a9a80"/>
      ${inner}
    </svg>`;
  }

  const walls = (studs = false) => `
      <rect x="40" y="50" width="80" height="36" fill="${studs ? '#f4e9d4' : '#f7f1e6'}" stroke="#d9cdb6" stroke-width=".8"/>
      ${studs
        ? Array.from({ length: 9 }, (_, i) => `<line x1="${44 + i * 9}" y1="51" x2="${44 + i * 9}" y2="85" stroke="#d2b98f" stroke-width="1.6"/>`).join('')
        : `<g stroke="#e7dcc8" stroke-width=".7">${[56, 62, 68, 74, 80].map(y => `<line x1="41" y1="${y}" x2="119" y2="${y}"/>`).join('')}</g>
           <rect x="74" y="64" width="12" height="22" rx="1" fill="#2f5d62"/>
           <rect x="50" y="60" width="14" height="11" rx="1" fill="#bfe0ea" stroke="#fff" stroke-width="1.4"/>
           <rect x="96" y="60" width="14" height="11" rx="1" fill="#bfe0ea" stroke="#fff" stroke-width="1.4"/>`}`;

  function shingleRoof(color = '#4a5157', lines = '#373d42') {
    const c = id('roofclip');
    return `<defs><clipPath id="${c}"><path d="M32 52 80 22 128 52Z"/></clipPath></defs>
      <path d="M32 52 80 22 128 52Z" fill="${color}"/>
      <g clip-path="url(#${c})" stroke="${lines}" stroke-width=".8">
        ${[28, 34, 40, 46].map((y, r) => `<line x1="30" y1="${y}" x2="130" y2="${y}"/>` +
          Array.from({ length: 14 }, (_, i) => `<line x1="${30 + i * 8 + (r % 2) * 4}" y1="${y}" x2="${30 + i * 8 + (r % 2) * 4}" y2="${y + 6}"/>`).join('')).join('')}
      </g>
      <path d="M30 53 80 21 130 53" fill="none" stroke="#2c3236" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  function house(kind) {
    if (kind === 'repair') {
      return scene(walls() + shingleRoof() + `
        <path d="M86 32 l12 7.5 -5 3 -12 -7.5z" fill="#8a6b4d" stroke="#6d5238" stroke-width=".6"/>
        <g stroke="#b0703c" stroke-width="1.6" stroke-linecap="round"><line x1="120" y1="86" x2="104" y2="36"/><line x1="128" y1="86" x2="112" y2="36"/>
        ${[44, 52, 60, 68, 76].map(y => `<line x1="${120 - (86 - y) * 0.32}" y1="${y}" x2="${128 - (86 - y) * 0.32}" y2="${y}"/>`).join('')}</g>`);
    }
    if (kind === 'new_construction') {
      return scene(walls(true) + `
        <path d="M32 52 80 22 128 52Z" fill="none" stroke="#c49a63" stroke-width="2.2" stroke-linejoin="round"/>
        <g stroke="#d2b07f" stroke-width="1.4">${[46, 58, 70, 80, 90, 102, 114].map(x => {
          const top = x <= 80 ? 52 - (x - 32) * 0.625 : 52 - (128 - x) * 0.625;
          return `<line x1="${x}" y1="52" x2="${x}" y2="${top}"/>`;
        }).join('')}<line x1="56" y1="52" x2="80" y2="22"/><line x1="104" y1="52" x2="80" y2="22"/></g>
        <line x1="30" y1="52" x2="130" y2="52" stroke="#c49a63" stroke-width="2.4"/>`);
    }
    if (kind === 'inspection') {
      return scene(walls() + shingleRoof('#6b5a4c', '#54473c') + `
        <circle cx="98" cy="36" r="13" fill="#e9f7ff" fill-opacity=".55" stroke="#1f3b3f" stroke-width="3"/>
        <line x1="107" y1="46" x2="118" y2="58" stroke="#1f3b3f" stroke-width="4.4" stroke-linecap="round"/>
        <path d="m92 36 4.5 4.5 7.5-8" fill="none" stroke="#22b35e" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    return scene(walls() + shingleRoof('#3f4a52', '#2e373e') + `
        <rect x="102" y="28" width="7" height="14" fill="#a8765a"/><rect x="100.5" y="26" width="10" height="3" fill="#8d6048"/>`);
  }

  // ── Material textures ──
  const PALETTES = {
    asphalt: { economy: ['#7d8388', '#6f757a'], standard: ['#4b5258', '#3c4247', '#585f65'], premium: ['#5a4a40', '#4a3d35', '#6a574a'] },
    metal: { economy: ['#b9c0c4'], standard: ['#3d4a50'], premium: ['#5b4636'] },
    tile: { economy: ['#9b8f84'], standard: ['#b3694a'], premium: ['#c2603a'] },
    flat: { economy: ['#2f3336'], standard: ['#e9ecec'], premium: ['#dfe7e7'] },
    other: { economy: ['#8a9094'], standard: ['#687076'], premium: ['#4d555b'] },
  };

  function swatch(type, grade) {
    const pal = (PALETTES[type] || PALETTES.other)[grade] || PALETTES.other.standard;
    const r = rng(type.length * 97 + grade.length * 31);
    let body = '';
    if (type === 'asphalt' && grade === 'economy') {            // 3-tab: even tabs
      for (let row = 0; row < 7; row++) {
        const off = row % 2 ? 10 : 0;
        for (let x = -20; x < 120; x += 20) body += `<rect x="${x + off}" y="${row * 12}" width="19" height="12" fill="${pal[(row + x / 20) & 1]}"/>`;
      }
    } else if (type === 'asphalt') {                              // architectural / designer: random widths, shadow lines
      const h = grade === 'premium' ? 16 : 12;
      for (let y = 0; y < 84; y += h) {
        let x = -r() * 20;
        while (x < 120) {
          const w = (grade === 'premium' ? 16 : 10) + r() * 16;
          body += `<rect x="${x}" y="${y}" width="${w - 1}" height="${h}" fill="${pal[Math.floor(r() * pal.length)]}"/>
                   <rect x="${x}" y="${y + h - 3}" width="${w - 1}" height="3" fill="#000" opacity=".18"/>`;
          x += w;
        }
      }
    } else if (type === 'metal') {
      body = `<rect width="120" height="80" fill="${pal[0]}"/>`;
      const step = grade === 'economy' ? 8 : 20;
      for (let x = step / 2; x < 120; x += step) body += `<rect x="${x}" y="0" width="${grade === 'economy' ? 2 : 3}" height="80" fill="#fff" opacity=".28"/><rect x="${x + 2}" y="0" width="1.4" height="80" fill="#000" opacity=".22"/>`;
      body += `<rect width="120" height="80" fill="url(#shine)"/>`;
    } else if (type === 'tile') {
      body = `<rect width="120" height="80" fill="${pal[0]}"/>`;
      for (let y = 0; y < 90; y += 14) for (let x = -14 + (y / 14 % 2) * 7; x < 130; x += 14) {
        body += grade === 'economy'
          ? `<rect x="${x}" y="${y}" width="13" height="13" fill="${pal[0]}" stroke="#000" stroke-opacity=".15"/>`
          : `<path d="M${x} ${y + 14} q7 -18 14 0" fill="#fff" fill-opacity=".14" stroke="#000" stroke-opacity=".22"/>`;
      }
    } else if (type === 'flat') {
      body = `<rect width="120" height="80" fill="${pal[0]}"/>`;
      if (grade === 'economy') for (let i = 0; i < 260; i++) body += `<circle cx="${r() * 120}" cy="${r() * 80}" r=".7" fill="#fff" opacity=".18"/>`;
      body += [26, 54].map(y => `<rect x="0" y="${y}" width="120" height="2" fill="#000" opacity=".12"/>`).join('');
    } else {
      body = `<rect width="120" height="80" fill="${pal[0]}"/>`;
    }
    return `<svg viewBox="0 0 120 80" class="art" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs><linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      ${body}</svg>`;
  }

  function hero() {
    const g = id('dusk');
    return `<svg viewBox="0 0 420 260" class="art hero-art" aria-hidden="true" preserveAspectRatio="xMidYMax meet">
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd8c0" stop-opacity=".35"/><stop offset="1" stop-color="#9fd8c0" stop-opacity="0"/></linearGradient></defs>
      <circle cx="330" cy="70" r="34" fill="#fde7a8" opacity=".85"/>
      <path d="M0 238 Q120 222 230 232 T420 226 V260 H0Z" fill="#1f5a4a"/>
      <circle cx="58" cy="196" r="30" fill="#2f7a5f"/><rect x="55" y="206" width="6" height="30" fill="#1d4a3c"/>
      <rect x="120" y="150" width="210" height="86" fill="#f7f1e6"/>
      <g stroke="#e3d6bf" stroke-width="1.2">${[164, 178, 192, 206, 220].map(y => `<line x1="120" y1="${y}" x2="330" y2="${y}"/>`).join('')}</g>
      <rect x="208" y="184" width="30" height="52" rx="2" fill="#2f5d62"/>
      <rect x="140" y="172" width="42" height="30" rx="2" fill="#bfe0ea" stroke="#fff" stroke-width="3"/>
      <rect x="266" y="172" width="42" height="30" rx="2" fill="#bfe0ea" stroke="#fff" stroke-width="3"/>
      <path d="M98 154 225 70 352 154Z" fill="#37424a"/>
      <g stroke="#28313a" stroke-width="1.4">${[92, 106, 120, 134, 148].map(y => `<line x1="${225 - (y - 70) * 1.51}" y1="${y}" x2="${225 + (y - 70) * 1.51}" y2="${y}"/>`).join('')}</g>
      <path d="M94 156 225 68 356 156" fill="none" stroke="#1e2529" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M100 58 L225 -10" stroke="none"/>
      <g class="hero-measure"><path d="M112 128 L218 58" stroke="#22b35e" stroke-width="2.4" stroke-dasharray="6 5"/>
      <circle cx="112" cy="128" r="4.5" fill="#22b35e"/><circle cx="218" cy="58" r="4.5" fill="#22b35e"/>
      <rect x="92" y="70" width="84" height="26" rx="13" fill="#fff"/><text x="134" y="87" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="12.5" font-weight="700" fill="#0f2b2f">2,400 sq ft</text></g>
    </svg>`;
  }

  return { house, swatch, hero };
})();
