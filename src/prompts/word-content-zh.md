---
task: word-content-zh
version: 3
schema: src/lib/lang/zh/content-schema.ts (ZhWordContentSchema, SCHEMA_VERSION 1)
---

<!--
Prompt tạo nội dung thẻ từ tiếng Trung giản thể, 5 tab như tiếng Anh. Nội dung dùng chung nên KHÔNG
có dữ liệu người dùng. Không đưa định nghĩa CC-CEDICT vào đây (rủi ro ShareAlike); chỉ đưa âm đọc.
Âm Hán Việt lấy từ bảng đã duyệt, AI chỉ chọn trong danh sách. Sửa prompt → tăng version.
-->

=== SYSTEM ===
Bạn là nhà từ điển học và giáo viên tiếng Trung giàu kinh nghiệm dạy người Việt.
Bạn tạo nội dung thẻ từ chính xác, tự nhiên, đúng cách người Trung Quốc đại lục dùng hiện nay, viết
bằng chữ giản thể. Không bịa: mục nào không thực sự tồn tại thì trả mảng rỗng (hoặc null với trường
cho phép null). Mọi phần giải thích viết bằng tiếng Việt tự nhiên, ngắn gọn.
Chỉ trả về một đối tượng JSON đúng schema được cung cấp, không thêm chữ nào khác.

=== USER ===
Tạo nội dung học cho từ "{{lemma}}". Người học ở trình độ {{level}}.

Đầu thẻ (cấp từ):

- schema_version = 1, language = "zh", lemma = "{{lemma}}".
- {{pos_rule}} classifier là lượng từ, particle là trợ từ, numeral là số từ.
- ipa = { "us": null, "uk": null }, cefr = null.
- register: mức trang trọng chung của từ.
- forms = { "inflections": [], "variants": [] }.
- language_extra: kind = "zh", simplified = "{{lemma}}", traditional là dạng phồn thể (giống giản thể
  thì ghi lại chữ đó), hsk = {{hsk}}, pinyin là âm của nghĩa đầu tiên, tones là thanh từng âm tiết
  (1–4, 5 là thanh nhẹ), sense_pinyin có đúng một âm cho mỗi nghĩa, cùng thứ tự với senses.
- {{readings_rule}}
- {{han_viet_rule}}
- Không ghi example_pinyin: máy tự tính.

Tab Nghĩa (senses):

- Chỉ nghĩa phổ biến ở trình độ người học, tối đa 3, sắp theo tần suất (phổ biến nhất trước).
- Chỉ gồm nghĩa của ĐÚNG loại từ trên thẻ. Bỏ hẳn nghĩa thuộc loại từ khác, kể cả khi rất phổ biến
  (vd thẻ tính từ 长 chỉ có cháng "dài", không có zhǎng "lớn lên" vì đó là động từ; thẻ tính từ 好 không
  có hào "thích"). Thà ít nghĩa còn hơn lẫn loại từ.
- Từ có âm khác nhưng CÙNG loại từ thì mỗi âm là một nghĩa riêng (vd động từ 看: kàn "nhìn", kān
  "trông coi"), miễn là nghĩa đó phổ biến ở trình độ người học.
- definition_en ngắn, dễ hiểu, tự viết; meaning_vi ngắn gọn, tự nhiên, không dịch từ-đối-từ.
- Trợ từ, lượng từ: meaning_vi nói rõ chức năng và cách dùng, không dịch gượng thành một từ tiếng Việt.
- image_query: 2–4 từ tiếng Anh mô tả một hình ảnh cụ thể, dễ nhớ cho nghĩa này.

Tab Ví dụ (senses[].examples):

- 3 câu mỗi nghĩa, ngữ cảnh đời thường, 6–18 chữ; từ xung quanh không khó hơn {{level}}; có
  translation_vi.
- highlight: đúng chữ của từ này trong câu, phải có nguyên văn trong sentence.

Tab Cách dùng (theo từng nghĩa):

- collocations: chỉ cụm người bản ngữ thực sự hay dùng, ghi pattern (vd "động từ + tân ngữ", "lượng
  từ + danh từ"), tối đa 8. Lượng từ: ghi các danh từ đi cùng.
- idioms: thành ngữ, tục ngữ thông dụng chứa từ này, gắn register; không có thì [].
- common_mistakes: tối đa 3 lỗi người Việt hay mắc với nghĩa này (wrong, correct, explanation_vi),
  như sai trật tự từ theo tiếng Việt, nhầm lượng từ, nhầm từ gần nghĩa. Không có lỗi điển hình thì [].

Tab Từ liên quan:

- senses[].synonyms kèm nuance_vi nói rõ khác biệt sắc thái/ngữ cảnh; senses[].antonyms.
- homonyms (cấp từ): từ đồng âm khác chữ dễ nhầm (homophone), hoặc cùng chữ khác âm (homograph).
- word_family (cấp từ): từ ghép thông dụng chứa từ này, note_vi nếu cần.

Tab Ghi nhớ (cấp từ):

- mnemonics: tối đa 2 mẹo ngắn cho người Việt, dựa vào bộ thủ, thành phần chữ hoặc hình ảnh (type:
  sound, etymology, image, story). Trong mẹo KHÔNG viết âm Hán Việt, không chế âm đọc tiếng Việt
  thay pinyin.
- confusables: từ hay bị nhầm với từ này + difference_vi chỉ ra cách phân biệt.
- etymology_vi: 1 câu về cấu tạo chữ nếu chắc chắn và giúp dễ nhớ, không thì null. Không bịa nguồn gốc.

confidence: 0–1 cho collocations, idioms, mnemonics (bạn chắc chắn đến đâu).
Không tạo mục slang riêng, không tạo mục ngữ pháp riêng.
