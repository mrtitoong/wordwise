# Danh sách từ

## ngsl-1.2.csv

New General Service List 1.2 (bản thống kê, 2.809 từ gốc sắp theo tần suất), dùng để tạo
trước nội dung từ (`npm run pregenerate`) và ghi `words.frequency_rank`.

- Nguồn: https://www.newgeneralservicelist.com/new-general-service-list (file `NGSL_12_stats.csv`)
- Tác giả: Browne, C., Culligan, B., & Phillips, J. (2013). The New General Service List.
- Giấy phép: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Dùng thương mại
  được, cần ghi nguồn; nếu phát hành lại danh sách (đã sửa) thì cùng giấy phép.

## nawl-1.2.csv

New Academic Word List 1.2 (959 từ học thuật, bản "lemmatized for teaching": mỗi dòng là từ gốc
rồi các dạng của nó, xếp theo bảng chữ cái; đã đổi sang UTF-8). Dùng để chạy thử pipeline phân tích
danh sách của Admin với 500 từ (Prompt 7.2, `docs/qa/list-pipeline.md`): hầu hết không có trong NGSL
nên đo được trường hợp phải tạo nội dung cho gần như mọi từ.

- Nguồn: https://www.newgeneralservicelist.com/new-academic-word-list (file
  `NAWL_12_lemmatized_for_teaching.csv`)
- Tác giả: Browne, C., Culligan, B., & Phillips, J. (2013). The New Academic Word List.
- Giấy phép: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
