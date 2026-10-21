/** Nhập nội dung file dạng chuỗi (Vite và scripts/build-functions.ts đều hỗ trợ `?raw`). */
declare module "*?raw" {
  const content: string;
  export default content;
}
