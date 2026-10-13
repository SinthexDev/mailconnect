export type ChangelogItem = { label: string; text: string };
export type ChangelogSection = { heading: string; items: ChangelogItem[] };
export type ChangelogRelease = {
  version: string;
  date: string;
  title: string;
  intro: string;
  sections: ChangelogSection[];
};

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const chunks = markdown.split(/^## /m).slice(1);
  return chunks.map((chunk) => {
    const [head = "", ...rest] = chunk.split("\n");
    const heading = /^Version\s+(\S+)\s+-\s+(.+)$/.exec(head.trim());
    const body = rest.join("\n").trim();
    const titleMatch = /^###\s+(.+)$/m.exec(body);
    const title = titleMatch?.[1]?.trim() ?? "";
    const afterTitle = titleMatch ? body.slice(titleMatch.index + titleMatch[0].length).trim() : body;
    const sectionParts = afterTitle.split(/^#### /m);
    const intro = (sectionParts[0] ?? "").trim();
    const sections = sectionParts.slice(1).map((part) => {
      const lines = part.split("\n");
      const headingLine = lines[0]?.trim() ?? "";
      const items = lines.slice(1).flatMap((line) => {
        const item = /^- \*\*(.+?)\*\*:\s*(.+)$/.exec(line.trim());
        return item ? [{ label: item[1] ?? "", text: item[2] ?? "" }] : [];
      });
      return { heading: headingLine, items };
    });
    return {
      version: heading?.[1] ?? "",
      date: heading?.[2]?.trim() ?? "",
      title,
      intro,
      sections,
    };
  });
}
