// noise.js — Zero-dep 2D Perlin noise + fractal Brownian motion

// Attempt: seeded permutation table (Fisher-Yates with splitmix32 PRNG)
export function createPermTable(seed) {
  const perm = new Uint8Array(512);

  // Fill 0..255
  for (let i = 0; i < 256; i++) perm[i] = i;

  // splitmix32 PRNG for deterministic shuffle
  let s = seed | 0;
  function rand() {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    z = (z ^ (z >>> 16)) >>> 0;
    return z / 0x100000000;
  }

  // Fisher-Yates shuffle
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }

  // Duplicate into upper half
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

  return perm;
}

// 2D gradient vectors (12 directions, classic Perlin set)
const GRAD_X = [1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
const GRAD_Y = [0, 0, 0, 0, 1, 1, -1, -1, 1, -1, 1, -1];

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + t * (b - a);
}

function grad(hash, x, y) {
  const h = hash % 12;
  return GRAD_X[h] * x + GRAD_Y[h] * y;
}

// Classic 2D Perlin noise, returns approximately [-1, 1]
export function perlin2(x, y, perm) {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const aa = perm[perm[xi] + yi];
  const ab = perm[perm[xi] + yi + 1];
  const ba = perm[perm[xi + 1] + yi];
  const bb = perm[perm[xi + 1] + yi + 1];

  return lerp(
    lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
    lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
    v
  );
}

// Fractal Brownian motion — layered Perlin octaves
export function fbm2(x, y, octaves, lacunarity, persistence, perm) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    value += perlin2(x * frequency, y * frequency, perm) * amplitude;
    maxAmp += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxAmp; // normalize to ~[-1, 1]
}
