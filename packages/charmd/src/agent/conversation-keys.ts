import { randomBytes } from "node:crypto";

// For agents behind an HTTP API, a charm's conversation is a name the agent keeps it under. A new
// conversation is a new name, random so it can't be one the agent already holds. Kept in memory
// only: after a charmd restart a charm is back on its first name, "opencharm-<charm id>".
function createConversationKeys() {
  const current = new Map<string, string>();
  return {
    of: (sessionKey: string): string => current.get(sessionKey) ?? sessionKey,
    reset: (sessionKey: string): void => {
      current.set(
        sessionKey,
        `${sessionKey}-${randomBytes(4).toString("hex")}`
      );
    },
  };
}

export { createConversationKeys };
