# Thí nghiệm trước khi làm tiếng Trung (2026-11-03)

Bốn thí nghiệm nhỏ trước khi làm tiếng Trung (docs/plan-zh.md). Code nằm trong `spikes/`, không động vào
code chính. Dữ liệu tải về để ở `spikes/.cache/` và kết quả sinh ra ở `spikes/*/out/`, cả hai không commit
(nặng, và có dữ liệu Arphic PL / CC BY-SA).

## Tóm tắt

| # | Thí nghiệm | Trạng thái | Kết luận ngắn |
|---|---|---|---|
| 1 | Azure chấm phát âm zh-CN, có bắt sai thanh không | **Xong với giọng máy** (48 mẫu); bản thu người thật chưa có | **Hầu như không bắt sai thanh.** Sai thanh: điểm chính xác chỉ giảm trung vị **1 điểm** (trung bình 3,4), 1/20 mẫu bị đánh "Mispronunciation". Sai phụ âm: giảm trung vị **49 điểm**, 3/4 bị đánh dấu. Không có mức âm tiết; "âm vị" zh-CN là cả âm tiết kèm thanh *của câu mẫu*, không cho biết người đọc thanh nào. |
| 1b | Tự đo cao độ (F0) trong trình duyệt để nhận thanh | **Xong với giọng máy**; giọng thật mới có 10 bản thu của 1 người | Nhanh (5–10 ms/bản thu) và **bắt được sai thanh tốt hơn Azure nhiều** (19/20 so với 1/20). Nhưng nhận đúng thanh trên giọng chưa gặp chỉ **~54% âm tiết** (giọng nữ ~65%, giọng nam ~43%) và **báo nhầm 8/28** bản đọc đúng. **Chưa đủ để chấm điểm**, chỉ đủ làm biểu đồ cao độ để người học tự so. Giọng thật: báo nhầm 2/6 từ đọc đúng, cùng hướng với kết luận này. |
| 2 | Hanzi Writer quiz trên điện thoại | **Xong trên Android**; iPhone chưa thử | Dữ liệu nét nhỏ (900 chữ HSK 1–3: ~818 KB gzip, trung vị 1 KB/chữ). Chấm một nét < 5 ms kể cả CPU chậm 4×. Lệch ≤ 9 px: được nhận ~100%; lệch 17 px: 89% (leniency 1) / 95% (1.5). Nét ngược chiều/sai thứ tự gần như luôn bị bắt. Máy thật (Chrome Android, leniency 1): **63/63 nét viết đúng được nhận**, chấm trung vị 6 ms, không giật khung hình. |
| 3 | Âm Hán Việt từ Unihan cho HSK 1–3 | **Xong** | Có âm cho 86% số chữ (cần tra qua chữ phồn thể), thiếu 123 chữ, trong đó có chữ rất thường gặp (爱 这 很 就 她). **Nhiều âm là âm Nôm, không phải âm Hán Việt** (們 → "món", 嗎 → "mửa"). Không dùng thẳng được. |
| 4 | Giấy phép | **Xong** (tóm tắt, không phải ý kiến pháp lý) | Rủi ro lớn nhất là **ShareAlike của CC-CEDICT** và **điều kiện công bố bản sửa của Arphic PL**. Unihan dễ. Danh sách HSK chưa rõ quyền tác giả. |

---

## 1. Azure Pronunciation Assessment với zh-CN

### Đã làm

- `spikes/azure-zh/assess.ts`: Azure TTS đọc 10 từ/cụm hai lần, **đúng thanh** và **cố ý sai thanh**. Sai thanh tạo
  bằng SSML `<phoneme alphabet="sapi" ph="mai 4">买</phoneme>` (ép đọc "mài" cho chữ 买). Thêm 2 mẫu đối chứng
  sai phụ âm, đúng thanh (四 sì → shì, 是 shì → sì). Mỗi mẫu đọc bằng hai giọng (Xiaoxiao nữ, Yunxi nam):
  **48 lượt chấm**, mỗi lượt 0,4–0,75 giây, tổng chi phí dưới $0,02.
- Chấm với `ReferenceText` là chữ đúng, `Granularity: Phoneme`, `PhonemeAlphabet: SAPI`, `NBestPhonemeCount: 5`,
  `EnableMiscue`. JSON thô ở `spikes/azure-zh/out/raw/`, bảng đầy đủ ở `out/results.md`.
- **Kiểm tra mẫu** (`spikes/azure-zh/verify.ts`): đưa từng file qua nhận dạng giọng nói zh-CN thường (không câu
  mẫu, không chấm), để chắc giọng máy đọc sai thanh thật. Kết quả: 买 sai → nghe ra **卖**, 书 → **树**, 水 → **睡**,
  汤 → **糖/唐**, 老师 → **老实/老石**, 谢谢 → **歇歇**, 中国 → **种果**. Vậy mẫu sai thanh là thật (14/20 mẫu
  đổi chữ rõ ràng; 你好, 我爱你 và một mẫu 中国, 谢谢 vẫn nghe ra chữ đúng nên có thể TTS đọc lệch ít).

### Kết quả

| Từ | Giọng | Nhận dạng thường: đúng → sai | Điểm chính xác: đúng → sai | Điểm tổng: đúng → sai | Giảm |
|---|---|---|---|---|---|
| 妈 | Xiaoxiao | 妈 → MA | 92 → 83 | 95 → 90 | 9 |
| 买 | Xiaoxiao | 买 → 卖 | 64 → 74 | 78 → 84 | −10 |
| 汤 | Xiaoxiao | 汤 → 糖 | 57⚠ → 83 | 11 → 90 | −26 |
| 书 | Xiaoxiao | 书 → 树 | 90 → 84 | 94 → 90 | 6 |
| 水 | Xiaoxiao | 谁 → 睡 | 59⚠ → 58⚠ | 12 → 12 | 1 |
| 你好 | Xiaoxiao | 你好 → 你好 | 96 → 93 | 98 → 96 | 3 |
| 谢谢 | Xiaoxiao | 谢谢 → 歇歇 | 99 → 98 | 99 → 99 | 1 |
| 老师 | Xiaoxiao | 老师 → 老实 | 100 → 92 | 100 → 95 | 8 |
| 中国 | Xiaoxiao | 中国 → 中国 | 100 → 100 | 100 → 100 | 0 |
| 我爱你 | Xiaoxiao | 我爱你 → 我爱你 | 100 → 100 | 100 → 100 | 0 |
| 妈 | Yunxi | 妈 → MA | 96 → 96 | 98 → 98 | 0 |
| 买 | Yunxi | 买 → 卖 | 100 → 74 | 100 → 84 | 26 |
| 汤 | Yunxi | Tongue → 唐 | 97 → 75 | 98 → 85 | 22 |
| 书 | Yunxi | 鼠 → 树 | 85 → 86 | 91 → 92 | −1 |
| 水 | Yunxi | 水 → 睡 | 97 → 86 | 98 → 92 | 11 |
| 你好 | Yunxi | 你好 → 你好 | 92 → 93 | 95 → 96 | −1 |
| 谢谢 | Yunxi | 谢谢 → 谢谢 | 98 → 98 | 99 → 99 | 0 |
| 老师 | Yunxi | 老师 → 老石 | 99 → 98 | 99 → 99 | 1 |
| 中国 | Yunxi | 中国 → 种果 | 100 → 84 | 100 → 90 | 16 |
| 我爱你 | Yunxi | 我爱你 → 我爱你 | 100 → 99 | 100 → 99 | 1 |
| *四 (sai phụ âm)* | Xiaoxiao | 四 → 是 | 97 → 48⚠ | 98 → 10 | **49** |
| *是 (sai phụ âm)* | Xiaoxiao | 是 → 四 | 88 → 46⚠ | 93 → 9 | **42** |
| *四 (sai phụ âm)* | Yunxi | 四 → 是 | 99 → 20⚠ | 99 → 4 | **79** |
| *是 (sai phụ âm)* | Yunxi | 是 → 四 | 86 → 63 | 92 → 78 | **23** |

⚠ = Azure đánh `Mispronunciation` (điểm từ < 60).

**Trả lời câu hỏi:**
- **Điểm tổng / điểm từ:** sai thanh chỉ làm điểm chính xác giảm trung vị **1 điểm** (trung bình 3,4; khoảng −26
  tới +26). 19/20 mẫu sai thanh vẫn ≥ 74 điểm; mẫu duy nhất bị đánh dấu (水) thì bản đúng cũng bị đánh dấu.
  Có 3 lần bản sai thanh được điểm **cao hơn** bản đúng. Sai phụ âm thì giảm 23–79 điểm (trung vị 49), 3/4 bị
  đánh dấu. Azure rõ ràng chấm chủ yếu phụ âm/vần, gần như bỏ qua thanh.
- **Âm tiết:** không có (zh-CN không trả `Syllables`). Với zh-CN, mỗi "âm vị" SAPI là **cả âm tiết kèm số thanh
  lấy từ câu mẫu** (vd `mai 3`), không phải thanh người đọc: đọc "mai 4" vẫn ra nhãn `mai 3`, điểm 66.
  `NBestPhonemes` (âm Azure nghe được) **trả rỗng** với zh-CN, nên không biết người học đã đọc thanh nào.
- **Âm vị:** điểm âm tiết khi sai thanh vẫn 50–100, không dùng làm ngưỡng được.

**Hệ quả:** không dùng được điểm của Azure Pronunciation Assessment để chấm thanh điệu. Có hai dấu hiệu khác
đáng thử (chưa làm):
1. **Nhận dạng thường** (không chấm) phân biệt được thanh khá tốt với từ một âm tiết có cặp tối thiểu
   (买/卖, 书/树, 水/睡). Nhưng nó cũng nhận nhầm 3/20 bản *đúng* (水 → 谁, 书 → 鼠, 汤 → "Tongue"), độ tin cậy
   thấp (0,1–0,4), và trong cụm từ thì bị ngữ cảnh kéo về chữ đúng (你好, 我爱你). Chỉ hợp làm gợi ý phụ.
2. **Tự đo cao độ (F0)** của bản thu trong trình duyệt, so đường cao độ với thanh mong đợi. Không tốn tiền, làm
  được cho từng âm tiết, nhưng phải tự làm và kiểm thử nhiều với giọng thật.

**Giới hạn:** mẫu là giọng máy, người học thật sai lẫn lộn hơn. Bản thu người thật vẫn nên có trước khi chốt:
đặt WAV 16 kHz mono vào `spikes/azure-zh/recordings/<chữ>__<nhãn>.wav` (vd `买__sai-thanh-4.wav`) rồi chạy lại
script. Nếu cần, tôi làm một trang thu âm nhỏ xuất đúng định dạng này.

Danh sách mẫu:

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

Kết quả đo ở trên khớp với tài liệu: zh-CN không có mức âm tiết và không có trường thanh điệu.

---

## 1b. Tự đo cao độ trong trình duyệt

Thử cách thay Azure để chấm thanh: đo đường cao độ (F0) của bản thu ngay trong trình duyệt rồi so hình dáng với 4
thanh. Code trong `spikes/tone-pitch/`, hàm thuần TypeScript (không thư viện, 4,5 KB sau nén), chạy được cả ở
Node lẫn trình duyệt.

### Cách làm

- **Đo cao độ** (`pitch.ts`): hàm CMND của YIN cho tối đa 4 ứng viên cao độ mỗi khung 10 ms, rồi Viterbi chọn
  đường liền mạch nhất (giống pYIN). Bản đầu lấy đáy đầu tiên như YIN gốc thì **mất gần hết giọng nam**: giọng
  máy nam (và người thật, nhất là thanh 3) hay **rè** (creaky) ở cuối âm tiết, ít tuần hoàn, nên bị bỏ khung
  hoặc nhảy quãng tám.
- **Tách âm tiết**: đoạn có tiếng, khoảng lặng; dính liền (vd 我爱你 toàn âm hữu thanh) thì cắt ở chỗ năng lượng
  thấp nhất. Số âm tiết lấy từ pinyin của từ.
- **Thanh cần đọc** có xét biến điệu: 3+3 → 2+3, 不 và 一 trước thanh 4. Thanh nhẹ không chấm.
- **Nhận thanh**: so đường cao độ (10 điểm, đơn vị nửa cung) với mẫu từng thanh. Có hai kiểu mốc: chỉ hình dáng
  (không biết giọng người nói), và **có hiệu chỉnh giọng** (biết cao độ trung bình của người nói, trong app lấy
  từ vài lần thu đầu). Thử ba bộ mẫu: theo sách (thang Chao 55/35/214/51), trung bình học từ dữ liệu, và láng
  giềng gần nhất.
- **Dữ liệu** (`make-samples.ts`): giọng máy Azure ép thanh bằng SSML. 6 giọng (3 nữ, 3 nam) × (12 âm tiết × 4
  thanh + 2 cặp × 16 tổ hợp thanh) = 480 bản, 672 âm tiết. **Chỉnh trên 2 giọng (Xiaoxiao, Yunxi), báo kết quả
  trên 4 giọng còn lại**, để không tự lừa mình bằng chính dữ liệu đã dùng để chỉnh. Thêm nhiễu trắng 20 dB và
  10 dB. Bảng đầy đủ ở `spikes/tone-pitch/out/results.md`.

### Kết quả trên 4 giọng chưa gặp (448 âm tiết; đoán bừa là 25%)

| Mẫu thanh | Cách | Sạch | Nhiễu 20 dB | Nhiễu 10 dB |
|---|---|---|---|---|
| Theo sách (Chao) | chỉ hình dáng | 46,4% | 44,4% | 41,1% |
| Theo sách (Chao) | có hiệu chỉnh giọng | 43,5% | 40,6% | 34,8% |
| Trung bình học từ 2 giọng | chỉ hình dáng | 46,9% | 45,1% | 42,0% |
| **Trung bình học từ 2 giọng** | **có hiệu chỉnh giọng** | **54,2%** | 51,8% | 47,5% |
| Láng giềng gần nhất | có hiệu chỉnh giọng | 50,7% (trên 2 giọng chỉnh: 96%, tức học thuộc) | 48,9% | 45,3% |

Với cách tốt nhất: từ một âm tiết đúng cả từ 60,9%, từ hai âm tiết chỉ 23,4%. Theo từng giọng: Xiaoxiao 83%
(giọng chỉnh), Xiaoyi 66%, Xiaochen 65%, Yunxi 58% (giọng chỉnh), Yunyang 45%, Yunjian 41%. **Giọng nữ khá hơn
hẳn giọng nam**, vì giọng nam rè nhiều.

Nhầm nhiều nhất: thanh 2 ↔ thanh 3 (cùng xuống thấp rồi lên; thanh 3 đọc riêng cũng có đuôi đi lên), thanh 1 ↔
thanh 4 (thanh 4 của giọng máy lên một chút trước khi xuống, thanh 1 cuối âm tiết hơi rơi), thanh 3 ↔ thanh 4.

### So trực tiếp với Azure (48 mẫu đúng/sai thanh của thí nghiệm 1)

| | Azure Pronunciation Assessment | Đo cao độ |
|---|---|---|
| Bắt được bản đọc sai thanh | 1/20 (điểm từ < 60) | **19/20** |
| Báo nhầm bản đọc đúng thanh | – | **8/28** (chủ yếu từ 2–3 âm tiết: 中国, 我爱你, 谢谢, 你好) |

Lưu ý: 48 mẫu này là của Xiaoxiao và Yunxi, đúng hai giọng dùng để chỉnh, nên con số thực tế với giọng lạ sẽ
**kém hơn**. Từ một âm tiết: bắt 9/10 sai thanh, báo nhầm 1/10.

### Tốc độ và kích thước

- Phân tích một bản thu ~2 giây: **5–10 ms** trong Chromium giả lập điện thoại (lần đầu ~95 ms do trình duyệt khởi
  động), 7,5 ms trung vị trên Node. Không cần máy chủ, không tốn tiền, âm thanh không rời máy.
- Thư viện 4,5 KB (đã nén gọn), mẫu thanh vài trăm byte.

### Kết luận

- **Khả thi về kỹ thuật** (nhanh, nhẹ, offline), và với sai thanh thì **có tín hiệu tốt hơn hẳn Azure**.
- **Chưa đủ để chấm điểm tự động**: ~54% nhận đúng trên giọng lạ, báo nhầm gần 3/10 bản đọc đúng. Nếu ghi lịch ôn
  (Quên/Nhớ) theo kết quả này, người học sẽ bị chấm sai rất nhiều.
- **Dùng được ngay** cho phần trực quan: vẽ đường cao độ của người học cạnh đường mẫu (từ audio mẫu của từ), để
  người học tự so, kèm gợi ý mềm ("âm tiết 2 có vẻ đi lên, thanh 4 cần đi xuống"), không chấm điểm.
- **Muốn chấm được** cần dữ liệu giọng người thật có gắn nhãn để học mẫu, thay cho giọng máy. Ví dụ bộ "Tone
  Perfect" (Đại học Michigan State, ~9.800 âm tiết đơn của 6 người bản ngữ; **giấy phép chưa kiểm tra**), hoặc bản
  thu do chủ sản phẩm/người thử tự thu và gắn nhãn. Kèm một bộ phân loại tốt hơn (đặc trưng độ dốc, điểm đổi
  hướng; hoặc mô hình nhỏ). Đây là việc của một prompt riêng, có tiêu chí rõ (vd ≥ 90% với từ một âm tiết trên
  giọng chưa gặp).

### Thử bằng giọng thật

Trang thử (Artifact riêng tư): **https://claude.ai/artifact/N44z2s4uRNzxJjHAeptQdv** (nguồn
`spikes/tone-pitch/tone-lab.template.html`, sinh bằng `build-page.mjs`).
- Trang Artifact **không dùng được micro**. Trên điện thoại: ghi âm bằng app Ghi âm của máy (mỗi file một từ), rồi
  bấm **Chọn file ghi âm** (m4a, mp3, wav đều được). Âm thanh chỉ xử lý trong trình duyệt, không gửi đi.
- Chọn từ trong danh sách (có cặp tối thiểu 买/卖, 书/树, 水/睡, 汤/糖) hoặc gõ pinyin số. Trang vẽ đường cao độ,
  ghi thanh cần đọc và thanh máy nghe ra. Từ lần thứ 4 trở đi trang tự hiệu chỉnh theo giọng người đọc.
- Đề xuất: mỗi từ đọc một lần đúng, một lần cố ý sai (tích ô "Tôi cố ý đọc sai thanh"), rồi bấm **Lưu kết quả**.
  Tôi đọc lại được kết quả và đường cao độ (không có âm thanh) để tính độ chính xác trên giọng thật.

Kết quả 2026-11-04 (chủ sản phẩm, Chrome Android, 10 bản thu; mỗi lần lưu chứa lại các lần trước nên 15 bản ghi
chỉ có 10 bản thu khác nhau):

| Loại bản thu | Kết quả |
|---|---|
| Đọc đúng (người đọc tự đánh dấu) | Khớp 4/6 từ, 6/8 âm tiết; báo nhầm 2/6 |
| Cố ý sai | Báo sai 4/4 |

- Hai từ bị báo nhầm: 你好 (cần 2-3, máy ra 3-3) và 谢谢 (cần 4-nhẹ, máy ra 4-3). Hai từ chưa đủ để kết luận biến
  điệu và thanh nhẹ là điểm yếu.
- 4/4 chỉ cho biết máy có báo sai. Không ghi lại thanh thực sự đã đọc nên **không tính được độ chính xác** của
  các bản này. Ví dụ 汤 có đường cao độ khá phẳng (143–160 Hz) mà máy ra thanh 3.
- 水 nhận đúng nhờ hiệu chỉnh theo giọng; chỉ so hình dáng thì ra thanh 2.
- Một người, một máy, 10 bản thu: chỉ là tín hiệu ban đầu. Kết luận giữ nguyên: vẽ đường cao độ, chưa chấm điểm.

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

### Máy thật

Trang thử (Artifact riêng tư): **https://claude.ai/artifact/NdwCzHRQGZZPmiY9UntDvx** (nguồn
`spikes/hanzi-writer/quiz.template.html`, sinh bằng `build-page.mjs`).
- Mở trên **Chrome Android** và **Safari iPhone**, đăng nhập claude.ai.
- Mỗi máy làm 2 lượt: **Viết đúng** (viết cẩn thận theo đúng thứ tự nét) và **Cố ý sai** (mỗi nét viết ngược
  chiều hoặc lệch chỗ), mỗi lượt 10 chữ. Xong lượt bấm **Lưu kết quả**.
- Trang đo: thời gian tải + vẽ chữ, nhấc tay → chấm (trung vị/lớn nhất), khung hình > 33 ms khi đang viết, số nét
  được chấp nhận/bị từ chối. Kèm thông tin máy (trình duyệt, kích thước màn hình, loại con trỏ).
- Kết quả lưu vào cơ sở dữ liệu của trang, tôi đọc lại được. Không lưu được thì bấm Sao chép rồi dán cho tôi.
- Có ô "Độ dễ" (leniency 0,7 / 1 / 1,5) để thử nếu thấy bị chấm sai oan nhiều.

Kết quả 2026-11-04 (chủ sản phẩm, Chrome Android, màn hình 393×873, ô viết 341 px, viết bằng tay, leniency 1):

| Lượt | Nét nhận / từ chối | Chấm: trung vị / lâu nhất | Vẽ chữ (trung vị) | Khung hình > 33 ms |
|---|---|---|---|---|
| Viết đúng (10/10 chữ xong) | 63 / 0 | 6 ms / 41 ms | 10 ms | 0/2.168 |
| Cố ý sai thứ tự | 27 / 36 | 5 ms / 19 ms | 11 ms | 0/1.318 |

- **Không có từ chối oan** ở lượt viết đúng, nên giữ leniency 1 (mặc định), chưa cần 1,5.
- **27/63 của lượt cố ý sai không phải tỉ lệ nhận nhầm.** Nét bị từ chối thì Hanzi Writer vẫn chờ đúng nét đó, nên
  nét viết tiếp theo có thể chính là nét đang chờ và được nhận đúng (vd 人: viết nét 2 bị từ chối, viết nét 1 được
  nhận). Trang không lưu đường nét nên không kiểm tra được từng nét; không so được con số này với bảng nhận nhầm ở
  trên. Trang cũng dừng chữ sau khi đủ số lần viết, nên lượt này không chữ nào hoàn thành.
- Vẽ chữ chưa tính thời gian tải qua mạng, vì dữ liệu nét nằm sẵn trong trang.
- **Hạn chế:** một người viết cẩn thận, một máy, có hiện nét mờ của chữ. Người mới học hoặc viết không có nét mờ có
  thể bị từ chối nhiều hơn. **Safari iPhone chưa thử.**

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
# 1b. Đo cao độ (cần khóa Azure để sinh mẫu)
npx tsx --env-file-if-exists=.env.local spikes/tone-pitch/make-samples.ts
npx tsx spikes/tone-pitch/evaluate.ts
node spikes/tone-pitch/build-page.mjs   # trang thử giọng thật
# 2. Hanzi Writer (npm pack hanzi-writer-data@2.0.1 hanzi-writer@3.7.3 vào spikes/.cache/hanzi-data)
node spikes/hanzi-writer/data-size.mjs spikes/.cache/hanzi-data/data-pkg spikes/.cache/hsk/hsk30-charlist.txt
node spikes/hanzi-writer/synthetic.mjs spikes/.cache/hanzi-data/data-pkg spikes/.cache/hanzi-data/hw-pkg/dist/hanzi-writer.min.js
node spikes/hanzi-writer/build-page.mjs spikes/.cache/hanzi-data/data-pkg   # trang thử máy thật
# 1. Azure (cần khóa trong .env.local)
npx tsx --env-file-if-exists=.env.local spikes/azure-zh/assess.ts
npx tsx --env-file-if-exists=.env.local spikes/azure-zh/verify.ts   # kiểm tra mẫu bằng nhận dạng thường
```
