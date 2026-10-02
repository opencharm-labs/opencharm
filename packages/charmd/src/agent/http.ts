import { parseSse } from "./sse";

async function postStream(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `The agent answered ${response.status} ${response.statusText} at ${url}`
    );
  }
  return response.body;
}

async function* sseJson(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<unknown> {
  for await (const { data } of parseSse(body)) {
    if (data === "[DONE]") return;
    try {
      yield JSON.parse(data) as unknown;
    } catch {
      // Not every agent sends JSON on every line; skip what we can't read.
    }
  }
}

export { postStream, sseJson };
