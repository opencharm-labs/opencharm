import type { AgentAdapter } from "./types";

type ConversationOptions = {
  // A charm whose last turn with the agent ended (answered, cancelled or failed) longer ago than
  // this starts a new conversation; 0 = never.
  afterMinutes: number;
  now?: () => number;
  log?: (entry: Record<string, unknown>) => void;
};
type Conversation = {
  // Each turn by its signal: a turn cancelled or superseded (a new key hold, a typed line) no longer
  // counts, though its stream may still be winding down.
  turns: Set<AbortSignal>;
  lastEnded: number | undefined;
  asked: boolean;
};
type Conversations = {
  agent: AgentAdapter;
  // Asked by the person (through the agent's tool, the CLI or the desktop menu): "now" when the
  // charm is between turns, "after-turn" when its current turn ends first.
  startNew: (sessionKey: string) => "now" | "after-turn";
};

// When a charm's conversation with the agent starts over (spec 003): when the person asks, or after
// a long pause. charmd only lets go of the session; what a new conversation means (memory, a
// greeting) stays the agent's business. A reset never cuts into a turn: it waits for the turn to end.
function withConversations(
  agent: AgentAdapter,
  options: ConversationOptions
): Conversations {
  const now = options.now ?? Date.now;
  const afterMs = options.afterMinutes * 60_000;
  const charms = new Map<string, Conversation>();

  function of(sessionKey: string): Conversation {
    let conversation = charms.get(sessionKey);
    if (!conversation) {
      conversation = { turns: new Set(), lastEnded: undefined, asked: false };
      charms.set(sessionKey, conversation);
    }
    return conversation;
  }

  function running(conversation: Conversation): boolean {
    return [...conversation.turns].some((signal) => !signal.aborted);
  }

  function reset(sessionKey: string, reason: "asked" | "idle"): void {
    const conversation = of(sessionKey);
    conversation.asked = false;
    conversation.lastEnded = undefined;
    agent.reset?.(sessionKey);
    options.log?.({ event: "new-conversation", session: sessionKey, reason });
  }

  // Before a turn, or the warm-up for one: an ask still waiting, or a long enough pause, starts over.
  function settle(sessionKey: string): void {
    const conversation = of(sessionKey);
    if (running(conversation)) return;
    if (conversation.asked) reset(sessionKey, "asked");
    else if (
      afterMs > 0 &&
      conversation.lastEnded !== undefined &&
      now() - conversation.lastEnded > afterMs
    )
      reset(sessionKey, "idle");
  }

  return {
    startNew(sessionKey) {
      const conversation = of(sessionKey);
      if (running(conversation)) {
        conversation.asked = true;
        return "after-turn";
      }
      reset(sessionKey, "asked");
      return "now";
    },
    agent: {
      name: agent.name,
      warm: (sessionKey) => {
        settle(sessionKey);
        agent.warm?.(sessionKey);
      },
      ...(agent.dispose ? { dispose: agent.dispose } : {}),
      async *reply(input) {
        settle(input.sessionKey);
        const conversation = of(input.sessionKey);
        conversation.turns.add(input.signal);
        try {
          yield* agent.reply(input);
        } finally {
          conversation.turns.delete(input.signal);
          conversation.lastEnded = now();
          // Asked during the turn (the agent's own tool, mid-reply): the turn has ended, so now.
          if (!running(conversation) && conversation.asked)
            reset(input.sessionKey, "asked");
        }
      },
    },
  };
}

export { withConversations };
export type { ConversationOptions, Conversations };
