type ReplyInput = {
  sessionKey: string;
  text: string;
  signal: AbortSignal;
  // Ask the person holding the charm, e.g. ask("write notes/plants.md"); resolves false on no,
  // silence or a cancelled turn. Absent when nobody can answer.
  ask?: (action: string) => Promise<boolean>;
};

// Every agent is the same shape to charmd: text in, a stream of text out. Memory, persona and tools
// stay inside the agent; the session key is how it knows which charm is talking.
type AgentAdapter = {
  name: string;
  reply: (input: ReplyInput) => AsyncIterable<string>;
  // Optional: start up while the user is still speaking, so the first answer comes sooner.
  warm?: (sessionKey: string) => void;
  // Optional: forget this charm's conversation, so its next turn starts a fresh one in the agent.
  // Never called during a turn of that charm (agent/conversations.ts waits for it to end).
  reset?: (sessionKey: string) => void;
  // Optional: release long-lived resources (processes, sockets) when charmd stops.
  dispose?: () => void;
};

export type { AgentAdapter, ReplyInput };
