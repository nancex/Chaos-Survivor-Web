let muted = false;
let audio = null;
let musicAudio = null;
let musicTracks = null;
let musicIndex = 0;
let proceduralTimer = null;
let musicGain = null;
const lastPlayed = new Map();
const MUSIC_MANIFEST_URL = "./assets/music/playlist.json";
const SUPPORTED_MUSIC = new Set(["mp3", "ogg", "wav", "m4a"]);

export function setMuted(value) {
  muted = value;
  if (musicAudio) musicAudio.muted = muted;
  if (musicGain) musicGain.gain.value = muted ? 0.0001 : 0.035;
  if (!muted && !musicAudio && !proceduralTimer) startMusic();
}

export function isMuted() {
  return muted;
}

export function playTone(freq, duration = 0.04, type = "sine") {
  if (muted) return;
  try {
    const ctx = ensureAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.035;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    muted = true;
  }
}

export function playSfx(name) {
  if (muted) return;
  const spec = SFX[name];
  if (!spec) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) || 0) < (spec.gap || 0)) return;
  lastPlayed.set(name, now);
  for (const layer of spec.layers) {
    if (layer.noise) playNoise(layer);
    else playLayer(layer);
  }
}

export async function startMusic() {
  if (muted) return;
  stopProceduralMusic();
  const tracks = await loadMusicTracks();
  if (!tracks.length) {
    startProceduralMusic();
    return;
  }
  playMusicTrack(musicIndex % tracks.length);
}

export function stopMusic() {
  if (musicAudio) {
    musicAudio.pause();
    musicAudio.src = "";
    musicAudio = null;
  }
  stopProceduralMusic();
}

export async function nextMusicTrack() {
  const tracks = await loadMusicTracks();
  if (!tracks.length) return;
  musicIndex = (musicIndex + 1) % tracks.length;
  playMusicTrack(musicIndex);
}

async function loadMusicTracks() {
  if (musicTracks) return musicTracks;
  try {
    const res = await fetch(MUSIC_MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`music manifest ${res.status}`);
    const data = await res.json();
    const rawTracks = Array.isArray(data) ? data : data.tracks;
    const base = new URL(MUSIC_MANIFEST_URL, window.location.href);
    musicTracks = (rawTracks || [])
      .map(normalizeTrack)
      .filter((track) => track && track.enabled !== false && SUPPORTED_MUSIC.has(fileExt(track.file)))
      .map((track) => ({ ...track, url: new URL(track.file, base).href }));
  } catch {
    musicTracks = [];
  }
  return musicTracks;
}

function normalizeTrack(track) {
  if (typeof track === "string") return { file: track, name: track };
  if (!track || typeof track.file !== "string") return null;
  return { file: track.file, name: track.name || track.file, enabled: track.enabled };
}

function fileExt(file) {
  return file.split("?")[0].split("#")[0].split(".").pop().toLowerCase();
}

function playMusicTrack(index) {
  const track = musicTracks[index];
  if (!track || muted) return;
  stopMusic();
  musicIndex = index;
  musicAudio = new Audio(track.url);
  musicAudio.loop = musicTracks.length === 1;
  musicAudio.volume = 0.42;
  musicAudio.muted = muted;
  musicAudio.addEventListener("ended", () => {
    if (!musicTracks?.length) return;
    musicIndex = (musicIndex + 1) % musicTracks.length;
    playMusicTrack(musicIndex);
  });
  musicAudio.play().catch(() => {
    musicAudio = null;
    startProceduralMusic();
  });
}

function startProceduralMusic() {
  if (muted || proceduralTimer) return;
  try {
    const ctx = ensureAudio();
    musicGain ||= ctx.createGain();
    musicGain.gain.value = 0.035;
    musicGain.connect(ctx.destination);
    let step = 0;
    const notes = [110, 146.83, 164.81, 220, 246.94, 293.66, 329.63, 440];
    const playStep = () => {
      if (muted) return;
      const root = notes[step % notes.length];
      playMusicNote(root, 1.8, "triangle", 0.022);
      playMusicNote(root * 1.5, 0.42, "sine", 0.012, 0.08);
      if (step % 4 === 0) playMusicNote(root * 0.5, 2.4, "sine", 0.018);
      step++;
    };
    playStep();
    proceduralTimer = window.setInterval(playStep, 1850);
  } catch {
    muted = true;
  }
}

function stopProceduralMusic() {
  if (proceduralTimer) {
    window.clearInterval(proceduralTimer);
    proceduralTimer = null;
  }
}

function playMusicNote(freq, duration, type, gainValue, delay = 0) {
  const ctx = ensureAudio();
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(musicGain || ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

const SFX = {
  start: { gap: 120, layers: [{ f: 180, to: 260, d: 0.09, type: "square", g: 0.035 }, { f: 360, d: 0.05, delay: 0.06, type: "triangle", g: 0.025 }] },
  select: { gap: 80, layers: [{ f: 420, to: 620, d: 0.08, type: "triangle", g: 0.03 }] },
  level: { gap: 120, layers: [{ f: 520, d: 0.05, type: "sine", g: 0.03 }, { f: 660, d: 0.05, delay: 0.05, type: "sine", g: 0.028 }, { f: 880, d: 0.08, delay: 0.1, type: "triangle", g: 0.026 }] },
  wave: { gap: 260, layers: [{ f: 220, to: 440, d: 0.12, type: "sawtooth", g: 0.024 }, { noise: true, d: 0.08, g: 0.018, filter: 900 }] },
  shoot: { gap: 32, layers: [{ f: 560, to: 300, d: 0.035, type: "square", g: 0.018 }] },
  hit: { gap: 28, layers: [{ f: 180, to: 120, d: 0.035, type: "triangle", g: 0.018 }, { noise: true, d: 0.025, g: 0.012, filter: 1200 }] },
  explode: { gap: 70, layers: [{ f: 120, to: 55, d: 0.15, type: "sawtooth", g: 0.035 }, { noise: true, d: 0.12, g: 0.03, filter: 500 }] },
  gem: { gap: 22, layers: [{ f: 820, to: 1120, d: 0.035, type: "sine", g: 0.018 }] },
  hurt: { gap: 180, layers: [{ f: 150, to: 90, d: 0.12, type: "sawtooth", g: 0.035 }] },
  slimeLand: { gap: 85, layers: [{ f: 130, to: 95, d: 0.055, type: "sine", g: 0.018 }] },
  victory: { gap: 500, layers: [{ f: 440, d: 0.08, type: "triangle", g: 0.035 }, { f: 660, d: 0.08, delay: 0.08, type: "triangle", g: 0.03 }, { f: 880, d: 0.16, delay: 0.16, type: "sine", g: 0.026 }] },
  defeat: { gap: 500, layers: [{ f: 160, to: 70, d: 0.26, type: "sawtooth", g: 0.035 }] },
};

function ensureAudio() {
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === "suspended") audio.resume();
  return audio;
}

function playLayer(spec) {
  try {
    const ctx = ensureAudio();
    const start = ctx.currentTime + (spec.delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.type || "sine";
    osc.frequency.setValueAtTime(spec.f, start);
    if (spec.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.to), start + spec.d);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(spec.g || 0.025, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, start + spec.d);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + spec.d + 0.02);
  } catch {
    muted = true;
  }
}

function playNoise(spec) {
  try {
    const ctx = ensureAudio();
    const start = ctx.currentTime + (spec.delay || 0);
    const length = Math.max(1, Math.floor(ctx.sampleRate * spec.d));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = spec.filter || 1000;
    gain.gain.setValueAtTime(spec.g || 0.02, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + spec.d);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(start);
    source.stop(start + spec.d);
  } catch {
    muted = true;
  }
}
