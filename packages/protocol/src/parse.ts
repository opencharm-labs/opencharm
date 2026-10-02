import type { z } from "zod";

import { LIMITS } from "./constants";
import {
  CLIENT_SCHEMAS,
  type ClientMessage,
  SERVER_SCHEMAS,
  type ServerMessage,
  messageKind,
} from "./messages";

type ParseErrorCode =
  | "too_large"
  | "invalid_json"
  | "unknown_type"
  | "unknown_op"
  | "invalid_fields";
type ParseResult<T> =
  | { ok: true; message: T }
  | { ok: false; error: { code: ParseErrorCode; detail: string } };

const encoder = new TextEncoder();

function fail<T>(code: ParseErrorCode, detail: string): ParseResult<T> {
  return { ok: false, error: { code, detail } };
}

// Never throws: a hostile or buggy peer gets a typed error, and the caller decides what to send back.
function parseWith<T>(
  raw: string,
  schemas: Record<string, z.ZodType>
): ParseResult<T> {
  if (encoder.encode(raw).byteLength > LIMITS.maxJsonBytes) {
    return fail("too_large", `over ${LIMITS.maxJsonBytes} bytes`);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fail("invalid_json", "not JSON");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return fail("invalid_json", "not a JSON object");
  }
  const { type, op } = data as { type?: unknown; op?: unknown };
  if (typeof type !== "string") return fail("unknown_type", "missing type");
  const kind = messageKind({
    type,
    ...(typeof op === "string" ? { op } : {}),
  });
  const schema = schemas[kind];
  if (!schema) {
    return type === "charm" &&
      Object.keys(schemas).some((k) => k.startsWith("charm:"))
      ? fail("unknown_op", `unknown op ${kind}`)
      : fail("unknown_type", `unknown type ${type}`);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return fail(
      "invalid_fields",
      parsed.error.issues.map((i) => i.path.join(".") || i.message).join(", ")
    );
  }
  return { ok: true, message: parsed.data as T };
}

function parseClientMessage(raw: string): ParseResult<ClientMessage> {
  return parseWith<ClientMessage>(raw, CLIENT_SCHEMAS);
}

function parseServerMessage(raw: string): ParseResult<ServerMessage> {
  return parseWith<ServerMessage>(raw, SERVER_SCHEMAS);
}

export { parseClientMessage, parseServerMessage };
export type { ParseErrorCode, ParseResult };
