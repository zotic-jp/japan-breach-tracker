export interface FeedSource {
  id: string;
  publisher: string;
  feedUrl: string;
  // Feed categories that mark an item as breach news (Security NEXT tags its posts).
  categories?: string[];
}

export const SOURCES: FeedSource[] = [
  {
    id: "security-next",
    publisher: "Security NEXT",
    feedUrl: "https://www.security-next.com/feed",
    categories: ["個人情報漏洩事件・事故", "不正アクセス事件", "紛失・誤廃棄", "ウイルス・不正アクセス"],
  },
  {
    id: "piyolog",
    publisher: "piyolog",
    feedUrl: "https://piyolog.hatenadiary.jp/rss",
  },
  {
    id: "scannetsecurity",
    publisher: "ScanNetSecurity",
    feedUrl: "https://scan.netsecurity.ne.jp/rss/index.rdf",
  },
];

// Cheap title filter so only likely breach stories reach the model.
const TITLE_KEYWORDS =
  /漏えい|漏洩|流出|不正アクセス|ランサム|身代金|個人情報|顧客情報|会員情報|誤送信|誤送付|誤配信|紛失|閲覧可能|閲覧できる|侵害|窃取|持ち出/;

export function looksLikeBreach(title: string, categories: string[], source: FeedSource): boolean {
  if (source.categories?.some((c) => categories.includes(c))) return true;
  return TITLE_KEYWORDS.test(title);
}
