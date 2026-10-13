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

function isTrailing(preset: ProviderPreset): boolean {
  return preset.id === "custom" || (!preset.imap && Boolean(preset.smtp));
}

export function sortProviders(presets: ProviderPreset[]): ProviderPreset[] {
  const byName = (left: ProviderPreset, right: ProviderPreset) =>
    left.name.localeCompare(right.name, "de", { sensitivity: "base" });
  const named = presets.filter((preset) => !isTrailing(preset)).sort(byName);
  const smtpOnly = presets.filter((preset) => isTrailing(preset) && preset.id !== "custom").sort(byName);
  const custom = presets.filter((preset) => preset.id === "custom");
  return [...named, ...smtpOnly, ...custom];
}

export function loadProviders(path = catalogPath()): ProviderCatalog {
  const presets = sortProviders(JSON.parse(readFileSync(path, "utf8")) as ProviderPreset[]);
  return {
    list: () => presets,
    find: (id: string) => presets.find((preset) => preset.id === id) ?? null,
  };
}
