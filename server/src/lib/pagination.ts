import type { Request } from 'express';

export function parsePagination(req: Request, defaultPageSize = 20, maxPageSize = 100) {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, Number(req.query.pageSize ?? defaultPageSize) || defaultPageSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    items,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}
