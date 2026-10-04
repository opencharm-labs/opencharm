// One list for the FAQ section and the FAQPage JSON-LD, so search engines read exactly what people see.
// Every answer is true to OPENCHARM.md and the code; keep each to 40–60 words.

type Faq = { q: string; a: string };

export const FAQ: Faq[] = [
  {
    q: "What is OpenCharm?",
    a: "OpenCharm is an open-source body for the AI agent you already run: a face made of typed glyphs, a voice and one key. It runs on a small ESP32-S3 board you build yourself, at the top of your computer’s screen as the desktop charm (macOS and Windows), or in your browser as an emulator. One agent at a time.",
  },
  {
    q: "Which agents does it work with?",
    a: "Any agent that speaks ACP, the Agent Client Protocol: Claude Code, Codex, Gemini CLI, goose, Hermes Agent and OpenClaw, or any server with an OpenAI-compatible API. Claude Code is the one tested end to end. charmd, a small daemon next to your agent, connects the charm to one agent at a time.",
  },
  {
    q: "Do I need the hardware?",
    a: "No. The desktop charm runs the same OpenCharm OS on your Mac or Windows PC, with a talk key that works in any app. Download it from GitHub Releases or build it from the code. The emulator runs the charm in your browser. The board is for when you want it on your desk.",
  },
  {
    q: "Is it always listening?",
    a: "No. The microphone opens only while you hold the key, on the board, in the emulator and in the desktop charm; let go and it closes. There is no wake word. The rule lives in OpenCharm OS itself, so your agent can’t open the microphone on its own.",
  },
  {
    q: "Where do my data and keys live?",
    a: "With you. Your agent runs on your own machine or server, with its own memory and model. The charm holds no API keys and never stores its PIN; charmd keeps only hashes. What you say is understood on your computer. By default the replies are spoken with Microsoft’s free voices, which means the text of each spoken reply goes to Microsoft; you can keep everything on your computer with the local voice instead, or use OpenAI with your own key.",
  },
  {
    q: "How much does it cost?",
    a: "The software is free and open source, and so are the desktop charm and the emulator. The board, a Waveshare ESP32-S3-Touch-AMOLED-2.16 with battery, is about $32 before shipping; a printed shell and a strap add a few dollars. We sell nothing: you buy the parts yourself.",
  },
  {
    q: "Does it work on Windows?",
    a: "Yes. The desktop charm runs on Windows as well as macOS: a small black pill at the top centre of the screen, with Ctrl + Alt + Space as the talk key. Both are built by the repository’s CI from the same code.",
  },
  {
    q: "Is it safe, and is there a warranty?",
    a: "It is open source and provided as is, with no warranty: you build and use it at your own risk. It is built to be careful: a PIN locks the charm on every power-on, five wrong tries block it, and you can lock or revoke it from your machine.",
  },
];
