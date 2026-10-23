// Sinh tự động bởi scripts/build-retention-table.ts (npm run srs:retention-table). KHÔNG SỬA TAY.
/**
 * Số lượt ôn trung bình mỗi ngày (tháng 7–12 khi học đều) theo số từ mới/ngày → tỉ lệ nhớ mong
 * muốn → chỉ thẻ Nghĩa (`meaning`) hoặc thêm thẻ Chính tả (`spelling`).
 */
export const RETENTION_LOAD: Record<
  number,
  Record<number, { meaning: number; spelling: number }>
> = {
  "5": {
    "0.8": { meaning: 40, spelling: 80 },
    "0.85": { meaning: 44, spelling: 91 },
    "0.9": { meaning: 53, spelling: 106 },
    "0.95": { meaning: 71, spelling: 143 },
  },
  "10": {
    "0.8": { meaning: 79, spelling: 160 },
    "0.85": { meaning: 91, spelling: 180 },
    "0.9": { meaning: 105, spelling: 210 },
    "0.95": { meaning: 143, spelling: 285 },
  },
  "15": {
    "0.8": { meaning: 118, spelling: 238 },
    "0.85": { meaning: 136, spelling: 266 },
    "0.9": { meaning: 159, spelling: 313 },
    "0.95": { meaning: 210, spelling: 426 },
  },
  "20": {
    "0.8": { meaning: 159, spelling: 314 },
    "0.85": { meaning: 181, spelling: 358 },
    "0.9": { meaning: 209, spelling: 419 },
    "0.95": { meaning: 284, spelling: 569 },
  },
};
