import { useMemo, useState } from "react";

export const TABLE_PAGE_SIZE = 10;

export function useTablePagination<T>(items: readonly T[]) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / TABLE_PAGE_SIZE));
  const [previousPageCount, setPreviousPageCount] = useState(pageCount);

  if (previousPageCount !== pageCount) {
    setPreviousPageCount(pageCount);
    if (page > pageCount) setPage(pageCount);
  }

  const currentPage = Math.min(page, pageCount);

  return {
    page: currentPage,
    pageCount,
    pageItems: useMemo(
      () =>
        items.slice(
          (currentPage - 1) * TABLE_PAGE_SIZE,
          currentPage * TABLE_PAGE_SIZE,
        ),
      [currentPage, items],
    ),
    setPage,
  };
}
