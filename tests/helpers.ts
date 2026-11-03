import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Dataset } from "../src/core/dataset";
import { buildDataset, parseCsvBytes, type ParseOverrides } from "../src/core/parse";

export function fixture(name: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(readFileSync(join(__dirname, "fixtures", name)));
}

export function openFixture(name: string, overrides: ParseOverrides = {}): Dataset {
  return buildDataset(parseCsvBytes(fixture(name), overrides));
}

export function parseText(text: string, overrides: ParseOverrides = {}): Dataset {
  return buildDataset(parseCsvBytes(new TextEncoder().encode(text), overrides));
}
