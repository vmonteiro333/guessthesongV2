import { describe, expect, it } from "vitest";
import { shuffle } from "./shuffle";

describe("shuffle", () => {
  it("NÃO altera o array original", () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    shuffle(original);
    expect(original).toEqual(copy);
  });

  it("mantém tamanho e elementos (sem duplicar/perder)", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = shuffle(items);
    expect(result).toHaveLength(items.length);
    expect([...result].sort((a, b) => a - b)).toEqual([...items].sort((a, b) => a - b));
  });

  it("funciona com array vazio e com um elemento", () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle([42])).toEqual([42]);
  });
});