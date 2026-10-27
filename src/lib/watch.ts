// The services someone uses, kept only in their browser. Storage can be unavailable (private mode,
// blocked site data), in which case the list is simply empty and nothing is saved.
const KEY = "jbt:services";

export function getWatched(): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function setWatched(ids: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // Not saved; the page still works for this visit.
  }
}
