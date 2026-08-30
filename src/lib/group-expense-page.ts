export interface GroupExpensePage {
  complete: boolean;
  limit: number;
  offset: number;
  sqlLimit: number | null;
}

export function groupExpensePage(params: Pick<URLSearchParams, "get">): GroupExpensePage {
  const complete = params.get("all") === "1";
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 200);
  const offset = complete ? 0 : Math.max(Number(params.get("offset")) || 0, 0);
  return { complete, limit, offset, sqlLimit: complete ? null : limit + 1 };
}

export function finishGroupExpensePage<T>(rows: T[], page: GroupExpensePage) {
  const hasMore = !page.complete && rows.length > page.limit;
  return {
    hasMore,
    items: hasMore ? rows.slice(0, page.limit) : rows,
  };
}
