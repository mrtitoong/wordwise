/**
 * Nguồn dữ liệu ghi ở trang Giới thiệu (docs/zh-spike.md §4). Chữ hiện ra nằm ở `about.sources.<key>`
 * trong messages; ở đây chỉ có link.
 */
export type AboutSource = {
  key: "ngsl" | "wiktionary" | "cedict" | "unihan" | "strokes" | "hanziWriter" | "hsk";
  /** Trang của nguồn. */
  url: string;
  /** Văn bản giấy phép (trang ngoài hoặc file đi kèm app). */
  licenseUrl?: string;
  /** Bản đã sửa của dữ liệu, tải được theo giấy phép. */
  dataUrl?: string;
};

const CC_BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/";
const REPO = "https://github.com/mrtitoong/wordwise/blob/main";

export const ABOUT_SOURCES: readonly AboutSource[] = [
  { key: "ngsl", url: "https://www.newgeneralservicelist.com/", licenseUrl: CC_BY_SA },
  { key: "wiktionary", url: "https://en.wiktionary.org/", licenseUrl: CC_BY_SA },
  {
    key: "cedict",
    url: "https://cc-cedict.org/wiki/",
    licenseUrl: CC_BY_SA,
    dataUrl: `${REPO}/data/zh/lexicon.tsv`,
  },
  {
    key: "unihan",
    url: "https://www.unicode.org/charts/unihan.html",
    licenseUrl: "/licenses/unicode.txt",
  },
  {
    key: "strokes",
    url: "https://github.com/skishore/makemeahanzi",
    licenseUrl: "/hanzi/ARPHICPL.TXT",
  },
  {
    key: "hanziWriter",
    url: "https://hanziwriter.org/",
    licenseUrl: "/licenses/hanzi-writer.txt",
  },
  { key: "hsk", url: "https://github.com/elkmovie/hsk30" },
];
