type SseEvent = { event: string | undefined; data: string };

// Minimal Server-Sent Events reader: enough for OpenAI-style streams (data lines, named events,
// comments as keepalives). Multi-line data fields are joined with "\n" as the spec says.
async function* parseSse(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | undefined;
  let data: string[] = [];
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? "\n\n" : decoder.decode(value, { stream: true });
      let newline = buffer.search(/\r?\n/);
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(
          buffer[newline] === "\r" ? newline + 2 : newline + 1
        );
        if (line === "") {
          if (data.length > 0) yield { event, data: data.join("\n") };
          event = undefined;
          data = [];
        } else if (line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""));
        } else if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        }
        newline = buffer.search(/\r?\n/);
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

export { parseSse };
export type { SseEvent };
