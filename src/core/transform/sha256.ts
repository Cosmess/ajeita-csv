// SHA-256 e HMAC-SHA256 síncronos. O crypto.subtle só é assíncrono, e as transformações
// são funções puras síncronas que rodam no worker.

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311];

// Constantes da especificação: parte fracionária das raízes cúbicas (K) e quadradas (H0) dos primos.
const fraction = (x: number) => ((x - Math.floor(x)) * 2 ** 32) >>> 0;
const K = Uint32Array.from(PRIMES, (p) => fraction(Math.cbrt(p)));
const H0 = Int32Array.from(PRIMES.slice(0, 8), (p) => fraction(Math.sqrt(p)));

const w = new Int32Array(64);

function compress(state: Int32Array, block: Uint8Array, offset: number): void {
  for (let i = 0; i < 16; i++) {
    const j = offset + i * 4;
    w[i] = (block[j]! << 24) | (block[j + 1]! << 16) | (block[j + 2]! << 8) | block[j + 3]!;
  }
  for (let i = 16; i < 64; i++) {
    const a = w[i - 15]!;
    const b = w[i - 2]!;
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
  }
  let a = state[0]!;
  let b = state[1]!;
  let c = state[2]!;
  let d = state[3]!;
  let e = state[4]!;
  let f = state[5]!;
  let g = state[6]!;
  let h = state[7]!;
  for (let i = 0; i < 64; i++) {
    const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (h + s1 + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) | 0;
    const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  state[0] = (state[0]! + a) | 0;
  state[1] = (state[1]! + b) | 0;
  state[2] = (state[2]! + c) | 0;
  state[3] = (state[3]! + d) | 0;
  state[4] = (state[4]! + e) | 0;
  state[5] = (state[5]! + f) | 0;
  state[6] = (state[6]! + g) | 0;
  state[7] = (state[7]! + h) | 0;
}

// Buffers reaproveitados entre chamadas: o hash roda milhões de vezes ao anonimizar.
let scratch = new Uint8Array(256);
const work = new Int32Array(8);
const encoder = new TextEncoder();

// Continua o hash a partir de `init`, que já processou `prefix` bytes (blocos inteiros),
// com a mensagem já em scratch[0, size).
function finish(init: Int32Array, prefix: number, size: number): Uint8Array {
  const length = Math.ceil((size + 9) / 64) * 64;
  scratch.fill(0, size, length);
  scratch[size] = 0x80;
  const bits = (prefix + size) * 8;
  const hi = Math.floor(bits / 2 ** 32);
  const lo = bits >>> 0;
  scratch[length - 8] = hi >>> 24;
  scratch[length - 7] = hi >>> 16;
  scratch[length - 6] = hi >>> 8;
  scratch[length - 5] = hi;
  scratch[length - 4] = lo >>> 24;
  scratch[length - 3] = lo >>> 16;
  scratch[length - 2] = lo >>> 8;
  scratch[length - 1] = lo;
  work.set(init);
  for (let offset = 0; offset < length; offset += 64) compress(work, scratch, offset);
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    const word = work[i]!;
    out[i * 4] = word >>> 24;
    out[i * 4 + 1] = word >>> 16;
    out[i * 4 + 2] = word >>> 8;
    out[i * 4 + 3] = word;
  }
  return out;
}

// Copia a mensagem para o scratch (aumentando se preciso) e devolve o tamanho em bytes.
function load(message: Uint8Array | string): number {
  // Cada caractere vira no máximo 3 bytes em UTF-8; sobra espaço para o padding.
  const max = (typeof message === "string" ? message.length * 3 : message.length) + 72;
  if (scratch.length < max) scratch = new Uint8Array(max * 2);
  if (typeof message !== "string") {
    scratch.set(message);
    return message.length;
  }
  return encoder.encodeInto(message, scratch).written;
}

export function sha256(message: Uint8Array | string): Uint8Array {
  return finish(H0, 0, load(message));
}

// HMAC com os blocos da chave já processados: cada valor custa só os blocos da mensagem.
export function hmacSha256(key: Uint8Array | string): (message: Uint8Array | string) => Uint8Array {
  let k = typeof key === "string" ? encoder.encode(key) : key;
  if (k.length > 64) k = sha256(k);
  const pad = (byte: number) => {
    const block = new Uint8Array(64).fill(byte);
    k.forEach((value, i) => (block[i] = value ^ byte));
    const state = H0.slice();
    compress(state, block, 0);
    return state;
  };
  const inner = pad(0x36);
  const outer = pad(0x5c);
  return (message) => {
    const innerHash = finish(inner, 64, load(message));
    scratch.set(innerHash);
    return finish(outer, 64, 32);
  };
}

export const toHex = (data: Uint8Array) => Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");

export function fromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error("Chave inválida");
  return Uint8Array.from(hex.match(/../g)!, (pair) => parseInt(pair, 16));
}
