// "KDDI Corporation" -> "KDDI", "Kaikatsu Frontier Inc. (AOKI Holdings)" -> "Kaikatsu Frontier".
export function brandName(nameEn: string): string {
  return nameEn
    .replace(/\(.*?\)/g, "")
    .replace(/,?\s*(Co\.,?\s*Ltd\.?|Corporation|Corp\.?|Inc\.?|Holdings)\s*$/i, "")
    .trim();
}

// "株式会社快活フロンティア（AOKIホールディングス）" -> "快活フロンティア"
export function brandNameJa(nameJa: string): string {
  return nameJa.replace(/（.*?）|\(.*?\)|株式会社/g, "").trim();
}
