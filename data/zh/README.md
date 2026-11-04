# Dữ liệu tiếng Trung

## lexicon.tsv

Trích từ [CC-CEDICT](https://cc-cedict.org/wiki/) (MDBG), giấy phép
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). File này là bản đã sửa đổi: bỏ phần
định nghĩa và tên riêng, thêm cờ âm thông dụng. Theo giấy phép, file này giữ nguyên CC BY-SA 4.0.

Sinh lại: tải `cedict_1_0_ts_utf-8_mdbg.txt.gz` từ https://www.mdbg.net/chinese/dictionary?page=cc-cedict,
giải nén rồi chạy `npx tsx scripts/build-zh-lexicon.ts <file>`.
