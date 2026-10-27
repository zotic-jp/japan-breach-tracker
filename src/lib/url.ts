// The site is served under a sub-path on GitHub Pages (/japan-breach-tracker), so every internal link
// goes through here instead of starting with a bare "/".
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function url(path: string): string {
  return `${BASE}${path}`;
}

// The page path without the base, for comparing against nav links.
export function pagePath(pathname: string): string {
  return pathname.slice(BASE.length).replace(/\/$/, "") || "/";
}
