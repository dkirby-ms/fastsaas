import type { ParamsDictionary, Request } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

export type ApiRequest<
  P = ParamsDictionary,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = ParsedQs
> = Request<P, ResBody, ReqBody, ReqQuery>;
