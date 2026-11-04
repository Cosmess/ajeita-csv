// Mapa de texto → número para milhões de chaves. No Chrome, um Map com chaves de texto
// como "123" ou "x123" fica dezenas de vezes mais lento que no Node (o hash de strings do
// navegador espalha mal esse tipo de chave). Aqui o Map recebe só números: o hash FNV-1a
// de cada chave, com as colisões encadeadas e conferidas pelo texto.

const END = -1;

function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // 30 bits: cabe num inteiro pequeno do V8 (sem alocar número no heap).
  return h & 0x3fffffff;
}

export class KeyTable {
  private readonly heads = new Map<number, number>();
  private readonly keys: string[] = [];
  private readonly values: number[] = [];
  private readonly chain: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  private find(key: string, h: number): number {
    let slot = this.heads.get(h) ?? END;
    while (slot !== END && this.keys[slot] !== key) slot = this.chain[slot]!;
    return slot;
  }

  get(key: string): number | undefined {
    const slot = this.find(key, hash(key));
    return slot === END ? undefined : this.values[slot];
  }

  has(key: string): boolean {
    return this.find(key, hash(key)) !== END;
  }

  set(key: string, value: number): void {
    const h = hash(key);
    const slot = this.find(key, h);
    if (slot !== END) {
      this.values[slot] = value;
      return;
    }
    this.chain.push(this.heads.get(h) ?? END);
    this.heads.set(h, this.keys.length);
    this.keys.push(key);
    this.values.push(value);
  }
}
