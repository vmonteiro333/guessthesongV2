/**
 * Normalização determinística de texto (sem fuzzy matching):
 * - minúsculas;
 * - remove acentos (NFD);
 * - "&" vira "and";
 * - apóstrofos removidos ("don't" === "dont");
 * - pontuação/símbolos viram espaço;
 * - espaços colapsados.
 */
export function normalizeText(input: string): string {
    if (typeof input !== "string") return "";
    return input
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/['\u2018\u2019\u02bc`\u00b4]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }