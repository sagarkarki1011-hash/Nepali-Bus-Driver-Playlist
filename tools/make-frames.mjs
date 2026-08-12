#!/usr/bin/env node
/**
 * Generates the placeholder frames in public/frames — a stylised hill road that
 * drifts a little between frames, so the loop has something to show before you
 * upload your own. Run with `npm run frames`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 1600;
const H = 900;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'frames');

const FRAMES = [
  { name: 'road-1', t: 0.0, light: ['#bcd9ec', '#e8dcc4'] },
  { name: 'road-2', t: 0.25, light: ['#a9cfe6', '#efdfc0'] },
  { name: 'road-3', t: 0.5, light: ['#9dc6e2', '#f0d8b4'] },
  { name: 'road-4', t: 0.75, light: ['#b3d3e8', '#ecdcc2'] }
];

/** Deterministic ridgeline: a few stacked sines, closed into a filled polygon. */
function ridge({ baseY, amp, freq, phase, offset, jag = 0 }) {
  const points = [];
  for (let x = -80; x <= W + 80; x += 20) {
    const u = (x + offset) / W;
    const y =
      baseY -
      amp * Math.sin(u * Math.PI * freq + phase) -
      amp * 0.45 * Math.sin(u * Math.PI * freq * 2.7 + phase * 1.6) -
      jag * Math.abs(Math.sin(u * Math.PI * freq * 5.3 + phase));
    points.push(`${x.toFixed(0)},${y.toFixed(1)}`);
  }
  return `M-80,${H} L${points.join(' L')} L${W + 80},${H} Z`;
}

function terraces(baseY, offset) {
  const lines = [];
  for (let i = 0; i < 7; i += 1) {
    const y = baseY + 26 + i * 34;
    const pts = [];
    for (let x = -80; x <= W + 80; x += 40) {
      const u = (x + offset * 0.6) / W;
      pts.push(`${x},${(y - 14 * Math.sin(u * Math.PI * 3 + i * 0.7)).toFixed(1)}`);
    }
    lines.push(`<path d="M${pts.join(' L')}" fill="none" stroke="#4a6b3c" stroke-opacity="${(0.5 - i * 0.05).toFixed(2)}" stroke-width="2.5"/>`);
  }
  return lines.join('');
}

function svg({ t, light }) {
  const drift = t * 320;
  const near = t * 620;
  const roadY = 640 + Math.sin(t * Math.PI * 2) * 14;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2f6f9e"/>
      <stop offset="55%" stop-color="${light[0]}"/>
      <stop offset="100%" stop-color="${light[1]}"/>
    </linearGradient>
    <linearGradient id="snow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="60%" stop-color="#dfe8f2"/>
      <stop offset="100%" stop-color="#a9bccf"/>
    </linearGradient>
    <linearGradient id="hill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6d8f57"/>
      <stop offset="100%" stop-color="#3d5a35"/>
    </linearGradient>
    <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#b2a894"/>
      <stop offset="100%" stop-color="#8b8272"/>
    </linearGradient>
    <radialGradient id="haze" cx="0.72" cy="0.22" r="0.5">
      <stop offset="0%" stop-color="#fff6de" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#fff6de" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#haze)"/>

  <g opacity="0.85">
    <ellipse cx="${(280 + drift * 0.4).toFixed(0)}" cy="150" rx="150" ry="34" fill="#ffffff" opacity="0.55"/>
    <ellipse cx="${(1180 - drift * 0.3).toFixed(0)}" cy="112" rx="196" ry="28" fill="#ffffff" opacity="0.4"/>
  </g>

  <path d="${ridge({ baseY: 452, amp: 116, freq: 2.2, phase: 0.4, offset: drift * 0.35, jag: 46 })}" fill="url(#snow)"/>
  <path d="${ridge({ baseY: 494, amp: 74, freq: 3.1, phase: 1.9, offset: drift * 0.6, jag: 22 })}" fill="#7d94ad" opacity="0.82"/>
  <path d="${ridge({ baseY: 556, amp: 58, freq: 2.4, phase: 3.3, offset: drift })}" fill="#5c7a63" opacity="0.9"/>

  <path d="${ridge({ baseY: 640, amp: 46, freq: 1.8, phase: 2.1, offset: near })}" fill="url(#hill)"/>
  ${terraces(650, near)}

  <path d="M-80,${H} L-80,${(roadY + 190).toFixed(0)}
    C ${(300 - near * 0.2).toFixed(0)},${(roadY + 120).toFixed(0)}
      ${(560 - near * 0.3).toFixed(0)},${roadY.toFixed(0)}
      ${(980 - near * 0.35).toFixed(0)},${(roadY - 26).toFixed(0)}
    L${W + 80},${(roadY + 6).toFixed(0)} L${W + 80},${H} Z" fill="url(#road)"/>
  <path d="M-80,${(roadY + 196).toFixed(0)}
    C ${(300 - near * 0.2).toFixed(0)},${(roadY + 126).toFixed(0)}
      ${(560 - near * 0.3).toFixed(0)},${(roadY + 6).toFixed(0)}
      ${(980 - near * 0.35).toFixed(0)},${(roadY - 20).toFixed(0)}
    L${W + 80},${(roadY + 12).toFixed(0)}" fill="none" stroke="#6f6757" stroke-width="4" opacity="0.6"/>

  <path d="M-80,${H} L-80,300 L${(210 - near * 0.5).toFixed(0)},${(360 + t * 60).toFixed(0)}
    L${(300 - near * 0.5).toFixed(0)},${H} Z" fill="#6a5c4c" opacity="0.95"/>
  <path d="M-80,${H} L-80,340 L${(150 - near * 0.5).toFixed(0)},${(430 + t * 60).toFixed(0)}
    L${(230 - near * 0.5).toFixed(0)},${H} Z" fill="#54483c"/>

  <rect width="${W}" height="${H}" fill="#1b1206" opacity="0.14"/>
</svg>
`;
}

await mkdir(OUT, { recursive: true });
for (const frame of FRAMES) {
  await writeFile(resolve(OUT, `${frame.name}.svg`), svg(frame), 'utf8');
  console.log(`wrote public/frames/${frame.name}.svg`);
}
