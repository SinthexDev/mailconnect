export type MailLink = {
  href: string;
  text: string;
};

const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const EXTRA = /<(?:area|v:roundrect)\b([^>]*)\/?>/gi;
const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const ALT = /<img\b[^>]*\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

export function messageText(plain: string, html: string | null): { text: string; links: MailLink[] } {
  const links = html ? extractLinks(html) : [];
  const base = plain.trim() ? plain : html ? htmlToText(html) : "";
  return { text: appendMissingLinks(base, links), links };
}

export function extractLinks(html: string): MailLink[] {
  const found: MailLink[] = [];
  const seen = new Set<string>();
  const add = (href: string | null, text: string) => {
    if (!href || seen.has(href) || found.length >= 50) return;
    seen.add(href);
    found.push({ href, text: text.slice(0, 200) });
  };
  for (const match of html.matchAll(ANCHOR)) add(hrefFrom(match[1] ?? ""), anchorLabel(match[2] ?? ""));
  for (const match of html.matchAll(EXTRA)) add(hrefFrom(match[1] ?? ""), "");
  return found;
}

export function htmlToText(html: string): string {
  const withLinks = html.replace(ANCHOR, (_, attrs: string, inner: string) => {
    const href = hrefFrom(attrs);
    const label = anchorLabel(inner);
    if (!href) return label;
    if (!label || label === href || label.includes(href)) return href;
    return `${label} (${href})`;
  });
  return collapse(stripHtml(withLinks));
}

export function appendMissingLinks(text: string, links: MailLink[]): string {
  const missing = links.filter((link) => !text.includes(link.href));
  if (missing.length === 0) return text;
  const lines = missing.map((link) => (link.text && !link.text.includes(link.href) ? `${link.text}: ${link.href}` : link.href));
  const base = text.trim();
  return base ? `${base}\n\n${lines.join("\n")}` : lines.join("\n");
}

export function stripHtml(value: string): string {
  return decodeEntities(
    value
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function hrefFrom(attrs: string): string | null {
  const match = HREF.exec(attrs);
  return normalizeHref(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

function normalizeHref(raw: string): string | null {
  const href = decodeEntities(raw).replace(/\s+/g, "").trim();
  if (!href || href.startsWith("#")) return null;
  const lower = href.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) return null;
  if (!/^(https?:|mailto:)/i.test(href)) return null;
  return href.slice(0, 2000);
}

function anchorLabel(inner: string): string {
  const text = stripHtml(inner).replace(/\s+/g, " ").trim();
  if (text) return text;
  const alt = ALT.exec(inner);
  return decodeEntities(alt?.[1] ?? alt?.[2] ?? alt?.[3] ?? "").replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => fromCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => fromCode(Number.parseInt(code, 16)))
    .replace(/&amp;/gi, "&");
}

function fromCode(code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return "";
  return String.fromCodePoint(code);
}

function collapse(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
