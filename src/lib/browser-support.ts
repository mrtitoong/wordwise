/**
 * Trình duyệt quá cũ (vd iPhone iOS 12): Tailwind 4 và JS của Next 16 cần Safari 16.4 / Chrome 111 /
 * Firefox 113 trở lên. Trình duyệt cũ hơn bỏ qua cả khối CSS `@layer` nên trang vỡ (nút trắng mặc
 * định), JS cũng có thể không chạy. Đoạn script trong <head> kiểm tra trước khi vẽ và chuyển sang trang
 * `/unsupported` (chỉ dùng style viết thẳng trên thẻ, không cần CSS/JS của app).
 */

export const UNSUPPORTED_PAGE = "/unsupported";

/**
 * Viết tay bằng ES5 (không import) vì chạy trước mọi bundle, trên cả trình duyệt cũ. Ba dấu hiệu, mỗi
 * cái ứng với một mốc: `@layer` (Safari 15.4), color-mix() (Safari 16.2), lookbehind của RegExp
 * (Safari 16.4). Lỗi khi kiểm tra cũng coi là không hỗ trợ.
 */
export const BROWSER_CHECK_SCRIPT = `(function(){var ok;try{ok="CSSLayerBlockRule" in window&&!!window.CSS&&CSS.supports("color","color-mix(in srgb, red, blue)")&&new RegExp("(?<=a)b").test("ab")}catch(e){ok=false}if(!ok&&location.pathname!=="${UNSUPPORTED_PAGE}")location.replace("${UNSUPPORTED_PAGE}")})();`;
