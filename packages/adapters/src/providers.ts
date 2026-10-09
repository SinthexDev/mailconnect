import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProviderCatalog, ProviderPreset } from "@mailconnect/domain";

function catalogPath(): string {
  const candidates = [
    join(process.cwd(), "data", "providers", "de-eu.json"),
    join(process.cwd(), "release", "data", "providers", "de-eu.json"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Provider-Katalog data/providers/de-eu.json wurde nicht gefunden.");
  return found;
}

export function loadProviders(path = catalogPath()): ProviderCatalog {
  const presets = JSON.parse(readFileSync(path, "utf8")) as ProviderPreset[];
  return {
    list: () => presets,
    find: (id: string) => presets.find((preset) => preset.id === id) ?? null,
  };
}
