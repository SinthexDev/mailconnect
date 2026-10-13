export type UidPage = { uids: number[]; complete: boolean };

type SearchHit = number[] | { all?: string; count?: number } | false | null | undefined;

export function uidsFromSearch(found: SearchHit, after: number, limit: number): UidPage | null {
  if (found == null || found === false || limit <= 0) return null;
  if (Array.isArray(found)) {
    const uids = found.filter((uid) => Number.isInteger(uid) && uid > after).sort((left, right) => left - right);
    return { uids: uids.slice(0, limit), complete: uids.length <= limit };
  }
  if (typeof found.all === "string" && found.all.length > 0) return takeFromSet(found.all, after, limit);
  if (found.count === 0 || found.all === "") return { uids: [], complete: true };
  return null;
}

function takeFromSet(all: string, after: number, limit: number): UidPage | null {
  const uids: number[] = [];
  for (const part of all.split(",")) {
    const piece = part.trim();
    if (!piece) continue;
    if (piece.includes("*")) return null;
    const colon = piece.indexOf(":");
    const rawStart = colon < 0 ? piece : piece.slice(0, colon);
    const rawEnd = colon < 0 ? piece : piece.slice(colon + 1);
    const start = Number(rawStart);
    const end = Number(rawEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1) return null;
    const from = Math.max(Math.min(start, end), after + 1);
    const to = Math.max(start, end);
    for (let uid = from; uid <= to; uid += 1) {
      uids.push(uid);
      if (uids.length >= limit) return { uids, complete: false };
    }
  }
  return { uids, complete: true };
}
