/** Mã lỗi của màn duyệt có thông báo riêng (admin.review.errors); còn lại là "failed". */
export const REVIEW_ERRORS = [
  "failed",
  "invalid",
  "not_found",
  "list_locked",
  "items_not_accepted",
  "list_empty",
  "list_not_in_review",
  "list_not_published",
  "sense_already_in_list",
  "sense_of_other_word",
  "items_mismatch",
  "senses_mismatch",
  "regenerate_forbidden",
  "regenerate_not_found",
  "regenerate_unavailable",
] as const;

export type ReviewError = (typeof REVIEW_ERRORS)[number];

export function reviewErrorKey(error: string): `errors.${ReviewError}` {
  const known = (REVIEW_ERRORS as readonly string[]).includes(error);
  return `errors.${known ? (error as ReviewError) : "failed"}`;
}
