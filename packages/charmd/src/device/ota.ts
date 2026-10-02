import type { IncomingMessage, ServerResponse } from "node:http";

// XiaoZhi firmware asks this endpoint where its WebSocket server is; answering it is how a charm
// finds charmd. Firmware updates will be announced here too (spec 009).
function handleOta(res: ServerResponse, websocketUrl: string): void {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      websocket: { url: websocketUrl },
      server_time: { timestamp: Date.now(), timezone_offset: 0 },
    })
  );
}

function isOtaRequest(req: IncomingMessage): boolean {
  const path = (req.url ?? "").split("?")[0];
  return (
    (path === "/ota/" || path === "/ota") &&
    (req.method === "GET" || req.method === "POST")
  );
}

export { handleOta, isOtaRequest };
