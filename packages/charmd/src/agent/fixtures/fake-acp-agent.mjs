#!/usr/bin/env node
// A stand-in ACP agent for tests, speaking real ACP over stdio through the official SDK. What it
// does depends on the words in the prompt: "tool", "slow", "permission", "crash", "fail".
// FAKE_ACP_LOG: a file that gets one JSON line per request; FAKE_ACP_AUTH=1: sessions need a login;
// FAKE_ACP_DIRS=1: advertises additionalDirectories.
import { appendFileSync } from "node:fs";
import { Readable, Writable } from "node:stream";

import * as acp from "@agentclientprotocol/sdk";

const LOG = process.env.FAKE_ACP_LOG;
const log = (method, params) =>
  LOG &&
  appendFileSync(
    LOG,
    `${JSON.stringify({ pid: process.pid, method, params })}\n`
  );

const turns = new Map();
let nextId = 1;

function say(cx, sessionId, text) {
  return cx.notify(acp.methods.client.session.update, {
    sessionId,
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text },
    },
  });
}

async function prompt(params, cx) {
  log("session/prompt", params);
  const { sessionId } = params;
  const text = params.prompt.map((block) => block.text ?? "").join("");
  const turn = new AbortController();
  turns.set(sessionId, turn);
  if (text.includes("crash")) process.exit(3);
  if (text.includes("fail")) throw new Error("model overloaded");
  if (text.includes("slow")) {
    await say(cx, sessionId, "Thinking");
    await new Promise((resolve) =>
      turn.signal.addEventListener("abort", resolve)
    );
    return { stopReason: "cancelled" };
  }
  if (text.includes("tool")) {
    await say(cx, sessionId, "Let me check.");
    await cx.notify(acp.methods.client.session.update, {
      sessionId,
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "t1",
        title: "Weather",
        kind: "fetch",
        status: "pending",
      },
    });
    await cx.notify(acp.methods.client.session.update, {
      sessionId,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "t1",
        status: "completed",
      },
    });
    await say(cx, sessionId, "It's sunny.");
    return { stopReason: "end_turn" };
  }
  if (text.includes("permission")) {
    const answer = await cx.request(
      acp.methods.client.session.requestPermission,
      {
        sessionId,
        toolCall: {
          toolCallId: "t2",
          title: "Edit AGENTS.md",
          kind: "edit",
          status: "pending",
        },
        options: [
          { kind: "allow_once", name: "Allow", optionId: "yes" },
          { kind: "reject_always", name: "Never", optionId: "never" },
          { kind: "reject_once", name: "Skip", optionId: "no" },
        ],
      }
    );
    log("permission-answer", answer);
    await say(
      cx,
      sessionId,
      answer.outcome.optionId === "yes" ? "Done." : "Not allowed."
    );
    return { stopReason: "end_turn" };
  }
  await say(cx, sessionId, "You said: ");
  await say(cx, sessionId, `${text}.`);
  return { stopReason: "end_turn" };
}

acp
  .agent({ name: "fake-acp-agent" })
  .onRequest("initialize", (ctx) => {
    log("initialize", ctx.params);
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: false,
        sessionCapabilities: process.env.FAKE_ACP_DIRS
          ? { additionalDirectories: {} }
          : {},
      },
    };
  })
  .onRequest("session/new", (ctx) => {
    log("session/new", ctx.params);
    if (process.env.FAKE_ACP_AUTH) throw acp.RequestError.authRequired();
    return {
      sessionId: `s${nextId++}`,
      modes: {
        currentModeId: "default",
        availableModes: [
          { id: "default", name: "Ask" },
          { id: "acceptEdits", name: "Accept edits" },
        ],
      },
    };
  })
  .onRequest("session/set_mode", (ctx) => {
    log("session/set_mode", ctx.params);
    return {};
  })
  .onRequest("session/prompt", (ctx) => prompt(ctx.params, ctx.client))
  .onNotification("session/cancel", (ctx) => {
    log("session/cancel", ctx.params);
    turns.get(ctx.params.sessionId)?.abort();
  })
  .connect(
    acp.ndJsonStream(
      Writable.toWeb(process.stdout),
      Readable.toWeb(process.stdin)
    )
  );
