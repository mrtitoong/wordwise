# Thí nghiệm trước khi làm tiếng Trung (2026-11-03)

Bốn thí nghiệm nhỏ trước khi làm tiếng Trung (docs/plan-zh.md). Code nằm trong `spikes/`, không động vào
code chính. Dữ liệu tải về để ở `spikes/.cache/` và kết quả sinh ra ở `spikes/*/out/`, cả hai không commit
(nặng, và có dữ liệu Arphic PL / CC BY-SA).

## Tóm tắt

| # | Thí nghiệm | Trạng thái | Kết luận ngắn |
|---|---|---|---|
| 1 | Azure chấm phát âm zh-CN, có bắt sai thanh không | **Chưa chạy được** – thiếu khóa Azure ở máy | Đã có script (24 mẫu đúng/sai thanh + bản thu thật). Theo tài liệu: zh-CN có điểm tổng, điểm từng từ, tên âm vị SAPI; **không có điểm âm tiết, không có prosody, không có mục "thanh điệu" riêng**. |
| 2 | Hanzi Writer quiz trên điện thoại | **Một phần** – đo tự động xong, máy thật chờ anh/chị thử | Dữ liệu nét nhỏ (900 chữ HSK 1–3: ~818 KB gzip, trung vị 1 KB/chữ). Chấm một nét < 5 ms kể cả CPU chậm 4×. Lệch ≤ 9 px: được nhận ~100%; lệch 17 px: 89% (leniency 1) / 95% (1.5). Nét ngược chiều/sai thứ tự gần như luôn bị bắt. |
| 3 | Âm Hán Việt từ Unihan cho HSK 1–3 | **Xong** | Có âm cho 86% số chữ (cần tra qua chữ phồn thể), thiếu 123 chữ, trong đó có chữ rất thường gặp (爱 这 很 就 她). **Nhiều âm là âm Nôm, không phải âm Hán Việt** (們 → "món", 嗎 → "mửa"). Không dùng thẳng được. |
| 4 | Giấy phép | **Xong** (tóm tắt, không phải ý kiến pháp lý) | Rủi ro lớn nhất là **ShareAlike của CC-CEDICT** và **điều kiện công bố bản sửa của Arphic PL**. Unihan dễ. Danh sách HSK chưa rõ quyền tác giả. |

---

## 1. Azure Pronunciation Assessment với zh-CN

### Đã làm

- `spikes/azure-zh/assess.ts`: Azure TTS đọc 10 từ/cụm hai lần, **đúng thanh** và **cố ý sai thanh**. Sai thanh tạo
  bằng SSML `<phoneme alphabet="sapi" ph="mai 4">买</phoneme>` (ép đọc "mài" cho chữ 买). Thêm 2 mẫu đối chứng
  sai phụ âm, đúng thanh (四 sì → shì, 是 shì → sì), để so mức nhạy với sai thanh. Mỗi mẫu đọc bằng hai giọng
  (Xiaoxiao nữ, Yunxi nam) → 24 lượt chấm, khoảng $0,01 tổng.
- Chấm với `ReferenceText` là chữ đúng, `Granularity: Phoneme`, `PhonemeAlphabet: SAPI`, `NBestPhonemeCount: 5`,
  `EnableMiscue`. Script ghi JSON thô của từng lượt và bảng so sánh: chữ Azure nhận ra, điểm tổng, điểm từng
  từ, điểm từng âm vị, 2 âm vị Azure cho là giống nhất.
- Bản thu thật của người: đặt `spikes/azure-zh/recordings/<chữ>__<nhãn>.wav` (vd `买__dung.wav`,
  `买__sai-thanh-4.wav`), script chấm luôn. Giọng máy đọc sai thanh là mẫu "sạch": chỉ sai thanh, còn lại
  chuẩn. Người học thật sai lẫn lộn hơn, nên vẫn cần bản thu người.

### Vì sao chưa chạy

Khóa `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` chỉ có trong Supabase Secrets. Supabase không cho đọc lại giá trị,
và `.env.local` ở máy không có khóa này. (`npm run pronunciation:smoke` của GĐ5 cũng cần khóa trong `.env.local`.)

**Việc anh/chị cần làm** (không dán khóa vào chat):
1. Mở Azure Portal → tài nguyên Speech đang dùng cho WordWise → **Keys and Endpoint**.
2. Mở file `D:\vibe\WordWise\.env.local` bằng Notepad, thêm hai dòng:
   `AZURE_SPEECH_KEY=<Key 1>` và `AZURE_SPEECH_REGION=<Location/Region, vd southeastasia>`. Lưu file.
3. Báo tôi, tôi sẽ chạy `npx tsx --env-file-if-exists=.env.local spikes/azure-zh/assess.ts` và điền kết quả.
4. (Tùy chọn) Thu 10 bản của người thật: mỗi từ trong bảng dưới đọc một lần đúng, một lần sai thanh, lưu WAV
   16 kHz mono vào `spikes/azure-zh/recordings/`. Trang `/settings/microphone` của app chưa xuất WAV, nên nếu
   cần tôi làm thêm một trang thu nhỏ.

| Chữ | Đúng | Sai cố ý | Ghi chú |
|---|---|---|---|
| 妈 | ma 1 | ma 4 | mā → mà |
| 买 | mai 3 | mai 4 | thành 卖 |
| 汤 | tang 1 | tang 2 | thành 糖 |
| 书 | shu 1 | shu 4 | thành 树 |
| 水 | shui 3 | shui 4 | thành 睡 |
| 你好 | ni 3 hao 3 | ni 2 hao 4 | sai cả hai âm tiết |
| 谢谢 | xie 4 xie 5 | xie 1 xie 5 | sai âm tiết đầu |
| 老师 | lao 3 shi 1 | lao 3 shi 2 | sai âm tiết sau |
| 中国 | zhong 1 guo 2 | zhong 4 guo 3 | |
| 我爱你 | wo 3 ai 4 ni 3 | wo 1 ai 1 ni 1 | đọc đều một thanh |
| 四 / 是 | si 4 / shi 4 | shi 4 / si 4 | đối chứng sai phụ âm |

### Tài liệu Azure nói gì (đọc ngày 2026-11-03)

Nguồn: [Use pronunciation assessment](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment).
- Điểm **âm tiết** (`Syllables`) chỉ có cho en-US: "Syllable level (en-US only)", "supports syllable groups only
  in en-US".
- **Prosody** (ngữ điệu, trọng âm) chỉ có cho en-US.
- Tên âm vị: IPA chỉ có en-US; **SAPI có cho en-US và zh-CN**. zh-CN vẫn có điểm tổng (PronScore), độ chính
  xác, độ trôi chảy, đầy đủ, điểm từng từ và từng âm vị.
- Không có trường nào riêng cho thanh điệu. `ErrorType` chỉ có Omission / Insertion / Mispronunciation (điểm
  từ < 60) / ngắt nghỉ / Monotone.

Vậy với tiếng Trung, mức nhỏ nhất có thể là **từ** (trong tiếng Trung thường 1–2 âm tiết) và **âm vị SAPI**.
Thí nghiệm cần trả lời ba câu: (a) sai thanh có kéo điểm từ/điểm tổng xuống dưới 60 không; (b) âm vị SAPI của
vần có mang số thanh không (vd `ai 3`), nếu có thì NBest có chỉ ra thanh người học đã đọc không; (c) sai thanh
bị trừ điểm ít hay nhiều so với sai phụ âm. Nếu cả (a) lẫn (b) đều "không" thì Azure không đủ để chấm thanh,
phải tự phân tích cao độ (F0) trong trình duyệt hoặc tìm nhà cung cấp khác.

---

## 2. Hanzi Writer chế độ quiz trên điện thoại

Hanzi Writer 3.7.3 (MIT), dữ liệu nét hanzi-writer-data 2.0.1 (Arphic PL, xem §4).

### Kích thước dữ liệu nét (`spikes/hanzi-writer/data-size.mjs`)

| | Thô | gzip |
|---|---|---|
| Thư viện `hanzi-writer.min.js` | 36,1 KB | 10,4 KB |
| Một chữ trung vị (怪, 8 nét) | 2,3 KB | 1,0 KB |
| Chữ lớn nhất trong HSK 1–3 (警, 19 nét) | 5,1 KB | 2,2 KB |
| HSK 3.0 cấp 1 (300 chữ) | 638 KB | 287 KB (từng file) |
| HSK 3.0 cấp 1–3 (900 chữ) | 2,1 MB | 818 KB (gộp một file; brotli 659 KB) |
| Toàn bộ gói dữ liệu (9.580 chữ) | 32 MB | — |

Cả 900 chữ HSK 1–3 đều có dữ liệu nét. Tải từng chữ khi cần (~1 KB/chữ) hoặc tải cả cấp để học offline đều nhẹ.

### Đo tự động (`spikes/hanzi-writer/synthetic.mjs`)

Chromium giả lập Pixel 7. Nét vẽ bằng **sự kiện chạm thật** (CDP `Input.dispatchTouchEvent`), theo đường giữa
nét của dữ liệu, cộng nhiễu kiểu ngón tay (lệch cả nét + rung chậm). Nhiễu tính trên lưới 1024 của dữ liệu:
30 ≈ 3% cạnh ô ≈ 9 px ở ô 320 px. 10 chữ HSK 1 (人 大 口 中 我 你 好 是 爱 谢, 62 nét), mỗi mức 2 lần. "Chấm" =
từ lúc nhấc tay tới khi Hanzi Writer báo đúng/sai.

Nét đúng có nhiễu (126 nét mỗi ô):

| Nhiễu (lưới 1024 ≈ px ở ô 320) | leniency 1 (mặc định) | leniency 1.5 |
|---|---|---|
| 0 | 100% | 100% |
| 15 (≈ 4 px) | 100% | 100% |
| 30 (≈ 9 px) | 99,2% | 100% |
| 45 (≈ 13 px) | 93,7% | 96,0% |
| 60 (≈ 17 px) | 88,9% | 95,2% |
| 80 (≈ 23 px) | 70,6% | 85,7% |

Nét sai (nhiễu 30), tỉ lệ **bị chấp nhận nhầm**:

| | leniency 1 | leniency 1.5 |
|---|---|---|
| Ngược chiều | 0/126 (0%) | 0/126 (0%) |
| Viết nét sau thay nét đang cần (sai thứ tự) | 0/106 (0%) | 2/106 (1,9%) |

Thời gian chấm một nét: trung vị **0,7 ms** (p95 2,6 ms); khi giả lập CPU chậm 4× (máy tầm trung): trung vị
**4,5 ms**, p95 9,1 ms. Phần chấm không gây trễ thấy được. Trễ cảm nhận trên máy thật chủ yếu nằm ở vẽ nét
theo ngón tay, phải đo trên máy thật.

Đọc kết quả: viết lệch tới ~9 px gần như luôn được nhận; lệch 13–17 px bắt đầu bị từ chối oan 5–11% số nét ở
mức mặc định. Viết ngược chiều hay sai thứ tự gần như luôn bị bắt. Leniency 1.5 giảm từ chối oan khá rõ, chỉ
nhận nhầm 2/106 nét sai thứ tự. **Hạn chế:** nhiễu giả không giống ngón tay thật (ngón che nét, nét cong
méo, nhấc tay sớm), nên các con số này chỉ cho thấy cách chấm phản ứng thế nào. Kết luận cuối cùng cần số
đo trên máy thật.

### Máy thật: chờ anh/chị thử

Trang thử (Artifact riêng tư): **https://claude.ai/artifact/NdwCzHRQGZZPmiY9UntDvx** (nguồn
`spikes/hanzi-writer/quiz.template.html`, sinh bằng `build-page.mjs`).
- Mở trên **Chrome Android** và **Safari iPhone**, đăng nhập claude.ai.
- Mỗi máy làm 2 lượt: **Viết đúng** (viết cẩn thận theo đúng thứ tự nét) và **Cố ý sai** (mỗi nét viết ngược
  chiều hoặc lệch chỗ), mỗi lượt 10 chữ. Xong lượt bấm **Lưu kết quả**.
- Trang đo: thời gian tải + vẽ chữ, nhấc tay → chấm (trung vị/lớn nhất), khung hình > 33 ms khi đang viết, số nét
  được chấp nhận/bị từ chối. Kèm thông tin máy (trình duyệt, kích thước màn hình, loại con trỏ).
- Kết quả lưu vào cơ sở dữ liệu của trang, tôi đọc lại được. Không lưu được thì bấm Sao chép rồi dán cho tôi.
- Có ô "Độ dễ" (leniency 0,7 / 1 / 1,5) để thử nếu thấy bị chấm sai oan nhiều.

---

## 3. Độ phủ âm Hán Việt (Unihan kVietnamese) trên HSK 1–3

Unihan 18.0.0 (2026-07-31). Danh sách: HSK 2.0 cấp 1–3 và HSK 3.0 cấp 1–3 (từ: drkameleon/complete-hsk-vocabulary;
bảng chữ chính thức 900 chữ: elkmovie/hsk30). Script `spikes/unihan-coverage/coverage.mjs`, kết quả đầy đủ ở
`spikes/unihan-coverage/out/coverage.md`.

| Tập chữ | Số chữ | Có kVietnamese ngay ở chữ giản thể | + tra qua chữ phồn thể | Thiếu hẳn |
|---|---|---|---|---|
| HSK 2.0 cấp 1–3 (chữ trong 600 từ) | 618 | 374 (60,5%) | 527 (85,3%) | 91 |
| HSK 3.0 cấp 1–3 (chữ trong 2.245 từ) | 899 | 543 (60,4%) | 776 (86,3%) | 123 |
| HSK 3.0 bảng chữ cấp 1–3 | 900 | 544 (60,4%) | 777 (86,3%) | 123 |

**Chữ thiếu hẳn – bảng chữ HSK 3.0 cấp 1–3 (123):**
爱 爸 帮 北 菜 蛋 电 饿 儿 饭 告 很 鸡 假 净 就 米 面 您 跑 汽 肉 识 谁 睡 岁 她 问 笑 爷 页 雨 这 桌 昨 坐 做 办 饱 遍
餐 春 但 懂 而 该 改 刚 够 喊 换 际 饺 脚 街 睛 静 酒 卡 靠 筷 脸 亮 辆 量 努 怕 碰 篇 食 它 套 疼 题 挺 碗 闻 夏 雪 以
椅 游 咱 澡 者 直 嘴 材 衬 范 啡 父 概 赶 怪 何 环 婚 济 较 仅 旧 咖 浪 录 暖 啤 赛 甜 握 误 线 乡 幸 需 烟 营 赢 泳 优
邮 值 资

(Danh sách thiếu cho HSK 2.0 và chữ chỉ có qua phồn thể: xem `out/coverage.md`.) Lưu ý: nhiều chữ "thiếu"
như 爱 (愛), 这 (這), 电 (電), 问 (問) có dạng phồn thể, nhưng **chữ phồn thể cũng không có kVietnamese**.

### Chất lượng: kVietnamese không phải trường "âm Hán Việt"

Unicode định nghĩa trường này chỉ là "The ideograph's pronunciation(s) in Quốc ngữ"
([UAX #38](https://www.unicode.org/reports/tr38/)): không tách âm Hán Việt với âm Nôm, không nói nguồn, không
nói thứ tự. Thực tế 98% số chữ có âm chỉ có **một** âm (533/544), và âm đó nhiều khi là âm Nôm:

| Chữ | Unihan cho | Âm Hán Việt thường dùng |
|---|---|---|
| 们 (們) | món | môn |
| 吗 (嗎) | mửa | ma |
| 你 | nể | nễ / nhĩ |
| 好 | háo | hảo / hiếu |
| 又 | lại | hựu |
| 吧 / 呢 / 啊 | và / nài / à | ba / ni / a |
| 别 (別) | biết | biệt |
| 猫 (貓) | mèo | miêu |
| 惯 (慣) | quen | quán |
| 检 (檢) | ghém | kiểm |
| 镜 (鏡) | kẻng | kính |
| 为 (爲) | vay | vi / vị |
| 强 (強) | càng | cường |

Tôi đối chiếu tay 43 chữ thường gặp có âm trong Unihan: khoảng **12 chữ (~28%) cho âm không phải Hán Việt
chuẩn**, nhiều nhất ở trợ từ. Số này chỉ là ước lượng (tôi tự đối chiếu), cần người biết Hán Việt kiểm lại.

**Kết luận:** Unihan chỉ dùng được làm gợi ý. Để có âm Hán Việt đáng tin cần một trong các cách: (a) nguồn khác
có tách riêng âm Hán Việt (vd từ điển Thiều Chửu – bản in 1942, tác giả mất 1954 nên có thể đã hết bảo hộ,
nhưng các bản số hóa có thể có điều khoản riêng; Wiktionary – CC BY-SA); (b) LLM gợi ý rồi Admin duyệt, chỉ
900–1.200 chữ nên làm được một lần; (c) kết hợp: lấy âm Unihan khớp với âm do LLM gợi ý, chỗ lệch thì Admin xem.
Chưa chọn; sẽ đề xuất khi lên kế hoạch.

---

## 4. Giấy phép

Đây là tóm tắt điều kiện và rủi ro tôi đọc được, **không phải ý kiến pháp lý**. Anh/chị tự quyết định.

### CC-CEDICT – CC BY-SA 4.0 ([cc-cedict.org](https://cc-cedict.org/wiki/))

Điều kiện:
- **Ghi nguồn**: tên CC-CEDICT (MDBG), link giấy phép, ghi rõ nếu đã sửa.
- **ShareAlike**: dữ liệu *phỏng theo* (sửa, gộp, dịch, bổ sung từ mục CC-CEDICT) khi đưa cho người khác dùng
  (hiện trong app là "đưa") phải theo CC BY-SA 4.0 hoặc giấy phép tương thích.
- Không được thêm điều khoản hoặc biện pháp kỹ thuật ngăn người nhận dùng các quyền BY-SA trên phần dữ liệu đó.
- Được dùng thương mại; code của app không bị ảnh hưởng.

Rủi ro và việc cần làm:
- **Rủi ro chính:** nếu nghĩa tiếng Việt hay nội dung thẻ từ được tạo **từ** định nghĩa tiếng Anh của CC-CEDICT
  (vd đưa vào prompt cho LLM dịch), phần đó có thể bị coi là bản phỏng theo, phải để CC BY-SA, và ai cũng có
  quyền chép lại (kể cả nội dung trả phí). Cách giảm rủi ro: chỉ lấy **pinyin, dạng giản/phồn thể** (gần như dữ
  kiện) từ CC-CEDICT, không đưa phần định nghĩa vào prompt; hoặc chấp nhận để riêng lớp dữ liệu tiếng Trung
  theo CC BY-SA.
- Lưu phần lấy từ CC-CEDICT thành cột/bảng riêng có ghi nguồn, để biết phần nào chịu BY-SA.
- Trang Giới thiệu ghi nguồn (plan-zh.md đã yêu cầu).
- Lưu ý: file JSON của drkameleon/complete-hsk-vocabulary ghi MIT nhưng phần nghĩa trong đó lấy từ CC-CEDICT
  (BY-SA). Chỉ nên lấy danh sách từ + cấp, không lấy nghĩa từ nguồn này.

### Unihan – Unicode License v3 ([license.txt](https://www.unicode.org/license.txt))

- Được dùng, sửa, phân phối, bán, không hạn chế, miễn là **kèm thông báo bản quyền và giấy phép** trong bản sao
  hoặc trong tài liệu đi kèm.
- Không dùng tên Unicode để quảng cáo khi chưa được phép.
- Rủi ro thấp. Việc cần làm: đưa thông báo vào trang Giới thiệu/ghi nguồn. Khó khăn thật là chất lượng
  kVietnamese (§3), không phải giấy phép.

### Arphic Public License – dữ liệu nét của Hanzi Writer / Make Me A Hanzi

hanzi-writer-data ghi "redistribute and/or modify this data under the terms of the Arphic Public License"; Make Me
A Hanzi: `graphics.txt` (nét chữ, lấy từ font AR PL KaitiM GB và AR PL UKai) theo Arphic PL. Thư viện Hanzi Writer
là MIT.

Điều kiện (ARPHICPL.TXT, 1999):
- Chép và phân phối nguyên bản: **giữ nguyên file ARPHICPL.TXT** trong mọi bản sao (§1).
- Bản sửa (đổi định dạng, cắt bớt chữ, sửa nét…): **ghi chú rõ trong từng file đã sửa** là sửa gì, khi nào
  (§2a), và **công khai bản sửa cho mọi người** theo cùng giấy phép, vd để ở một địa chỉ tải được (§2b).
- Không được thêm hạn chế cho người nhận (§5). Vi phạm thì **mất quyền, kể cả hồi tố** (§3).
- Code app chỉ "đặt cạnh" dữ liệu thì không bị giấy phép này ràng buộc (§2, đoạn "mere aggregation").
- Giấy phép viết cho font, áp sang dữ liệu nét là do Make Me A Hanzi chọn; cách hiểu có thể chưa thống nhất.

Rủi ro và việc cần làm:
- Gửi dữ liệu nét xuống trình duyệt là phân phối, nên phải kèm ARPHICPL.TXT (vd ở một đường dẫn công khai, có link
  từ trang Giới thiệu).
- Nếu gộp nhiều chữ thành một file hay đổi định dạng (vd gói offline theo cấp HSK) thì đó là bản sửa: ghi chú
  trong file, và để bản gộp tải công khai được (repo đang công khai nên để script tạo + nơi tải là đủ dễ).
- **Không dùng** `dictionary.txt` của Make Me A Hanzi (bộ thủ, cấu tạo chữ, nguồn gốc) nếu không chấp nhận
  **LGPL-3** cho phần dữ liệu đó.
- Bỏ một nét sai trong dữ liệu (nếu có) cũng là sửa → cùng nghĩa vụ trên.

### Danh sách HSK

- Danh sách chính thức HSK 3.0 nằm trong 《国际中文教育中文水平等级标准》GF 0025-2021, Bộ Giáo dục và Ủy ban
  Ngôn ngữ Văn tự Quốc gia Trung Quốc ban hành, NXB Đại học Ngôn ngữ Bắc Kinh in thành sách
  ([chinanews](https://www.chinanews.com.cn/gn/2022/03-07/9694711.shtml)). HSK 2.0 (2009/2012) do Hanban phát hành.
- **Quyền tác giả chưa rõ.** Luật Quyền tác giả Trung Quốc (Điều 5) loại trừ "văn bản chính thức có tính lập
  pháp, hành chính, tư pháp", nhưng một tiêu chuẩn ngôn ngữ có thuộc nhóm này không thì tôi không xác định được.
  Một danh sách từ chọn lọc có thể được bảo hộ như một tuyển tập. Nhiều app học tiếng Trung dùng danh sách HSK,
  nhưng đó không phải bằng chứng pháp lý.
- Bản trên GitHub: elkmovie/hsk30 (Pleco, MIT, OCR từ PDF chính thức, ghi "chưa soát kỹ"); drkameleon (MIT, có
  lẫn nghĩa CC-CEDICT như trên). MIT chỉ áp cho phần công sức của người làm, không thay được quyền của bên ban
  hành danh sách.
- Tên "HSK"/"汉语水平考试" có thể là nhãn hiệu (tôi **chưa xác minh** chủ sở hữu và phạm vi đăng ký). Nên dùng
  kiểu mô tả ("từ vựng theo cấp HSK 3.0"), không gợi ý app được chứng nhận hay liên kết chính thức.
- Việc cần làm: ghi nguồn danh sách; nếu muốn chắc thì hỏi luật sư về GF 0025-2021, hoặc chỉ dùng cấp HSK làm
  nhãn trên kho từ của mình thay vì phát hành lại nguyên danh sách.

### Bảng việc cần làm để tuân thủ

| Nguồn | Ghi nguồn ở trang Giới thiệu | Kèm văn bản giấy phép | Công khai bản sửa | Chia sẻ lại cùng giấy phép |
|---|---|---|---|---|
| CC-CEDICT | Có | Link CC BY-SA 4.0 | – | Có, cho phần dữ liệu phỏng theo |
| Unihan | Có (thông báo Unicode) | Thông báo + license v3 | – | Không |
| Dữ liệu nét (Arphic PL) | Có (Make Me A Hanzi, Arphic) | ARPHICPL.TXT nguyên văn | Có, nếu sửa/gộp | Có, cho dữ liệu nét |
| Make Me A Hanzi dictionary.txt (nếu dùng) | Có | LGPL-3 | Có | Có |
| Hanzi Writer (thư viện) | Nên | MIT (trong bundle) | – | Không |
| Danh sách HSK | Có | – | – | Chưa rõ (xem trên) |

---

## Cách chạy lại

```
# 3. Unihan
curl -L -o spikes/.cache/unihan/Unihan.zip https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip  # rồi giải nén
node spikes/unihan-coverage/coverage.mjs spikes/.cache/unihan spikes/.cache/hsk
# 2. Hanzi Writer (npm pack hanzi-writer-data@2.0.1 hanzi-writer@3.7.3 vào spikes/.cache/hanzi-data)
node spikes/hanzi-writer/data-size.mjs spikes/.cache/hanzi-data/data-pkg spikes/.cache/hsk/hsk30-charlist.txt
node spikes/hanzi-writer/synthetic.mjs spikes/.cache/hanzi-data/data-pkg spikes/.cache/hanzi-data/hw-pkg/dist/hanzi-writer.min.js
node spikes/hanzi-writer/build-page.mjs spikes/.cache/hanzi-data/data-pkg   # trang thử máy thật
# 1. Azure (cần khóa trong .env.local)
npx tsx --env-file-if-exists=.env.local spikes/azure-zh/assess.ts
```
