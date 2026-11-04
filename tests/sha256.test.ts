import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fromHex, hmacSha256, sha256, toHex } from "../src/core/transform/sha256";

const messages = ["", "abc", "529.982.247-25", "a".repeat(55), "a".repeat(56), "a".repeat(64), "ç".repeat(100), "x".repeat(1000)];

describe("sha256", () => {
  it("bate com o node:crypto", () => {
    for (const m of messages) expect(toHex(sha256(m))).toBe(createHash("sha256").update(m).digest("hex"));
  });

  it("HMAC bate com o node:crypto, com chave curta e longa", () => {
    for (const key of ["chave", "k".repeat(64), "k".repeat(100)]) {
      const mac = hmacSha256(key);
      for (const m of messages) expect(toHex(mac(m))).toBe(createHmac("sha256", key).update(m).digest("hex"));
    }
  });

  it("converte hexadecimal nos dois sentidos", () => {
    expect(toHex(fromHex("00ff10ab"))).toBe("00ff10ab");
    expect(() => fromHex("xyz")).toThrow("Chave inválida");
  });
});
