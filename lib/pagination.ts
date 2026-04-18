// Shared pagination math for admin lists. Every list page speaks the
// same URL dialect (`?page=N`) so deep-links and browser-back behave
// consistently, and the helpers below make the Prisma skip/take math
// identical everywhere — no one-list-off-by-one bugs.
//
// Design notes:
// - 1-based page index matches the URL. `skip` is (page-1) * pageSize.
// - Coerce anything non-numeric or <1 to page 1, silently. Admin URLs
//   shouldn't 400 on a fat-finger; better to land on page 1.
// - Clamp page above totalPages to the last page. If total is 0,
//   totalPages is 1 and we render the empty state — the pagination
//   component hides itself.

export type PageInfo = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  total: number;
  totalPages: number;
};

export function parsePageParam(raw: string | string[] | undefined): number {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(first ?? '1', 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function paginate(
  rawPage: string | string[] | undefined,
  total: number,
  pageSize: number,
): PageInfo {
  const requested = parsePageParam(rawPage);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested, totalPages);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    total,
    totalPages,
  };
}
