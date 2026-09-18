import type { Request } from 'express';

export function qStr(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return typeof v === 'string' ? v : undefined;
}

// Express 5's ParamsDictionary types a value as `string | string[]` to allow
// for repeated wildcard segments; every route here uses single named params,
// so this always narrows to the plain string.
export function pStr(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0]! : v!;
}
