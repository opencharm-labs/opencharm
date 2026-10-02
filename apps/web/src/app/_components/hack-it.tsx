import { Box } from "./box";
import { CodeBlock, CodeLines, D, G, W, Y, type Line } from "./code-lines";
import { Section, SectionHead, SectionIntro } from "./section";
import { BodyText } from "./text";

type Level = {
  k: string;
  who: string;
  t: string;
  d: string;
  solid?: boolean;
  code: Line[];
};

const LEVELS: Level[] = [
  {
    k: "LEVEL 1 · TEACH IT",
    who: "NO CODE",
    t: "Write a sentence",
    d: "Who the charm is and what it knows are text files in its workspace. Ask your coding agent to change them.",
    solid: true,
    code: [
      ["# charm/.agents/skills/wrap-up/SKILL.md", D],
      ['When I say "wrap up":', W],
      ["- today in 3 lines", W],
      ["- what you finished for me", W],
      ["- tomorrow’s first meeting", W],
      [<># written by momo, kept by you</>, Y],
    ],
  },
  {
    k: "LEVEL 2 · TOOLS",
    who: "MCP",
    t: "Give it tools",
    d: "Add MCP servers to its workspace. It already has the charm’s own: faces, questions, the orange “it needs you”.",
    code: [
      ["# charm/.mcp.json", D],
      ['{ "mcpServers": { "home": {', W],
      ['    "command": "your-home-mcp" } } }', W],
      ["# and the charm’s own tools:", D],
      ["show_face · ask · notify · say · set_look", G],
      [<>ask: &quot;Turn off the oven?&quot; → yes</>, Y],
    ],
  },
  {
    k: "LEVEL 3 · FIRMWARE",
    who: "C++ · ESP-IDF",
    t: "Change the body",
    d: "Fork OpenCharm OS: one C++ core for the board and the browser emulator, tested on your computer.",
    code: [
      ["// firmware/core/src/app.cpp", D],
      ["case ServerKind::Ask:", W],
      ["  set_needs_you(true);", G],
      ["  view_.show_decision(", W],
      ["      ask_text_, ask_yes_, ask_no_);", W],
      ["  break;", W],
    ],
  },
];

function HackIt() {
  return (
    <Section id="hack">
      <SectionHead ix="09" label="HACK IT" />
      <SectionIntro title="Three levels of making it yours.">
        Most people stay on level one. Going deeper changes everything, down to
        the firmware.
      </SectionIntro>
      <div className="grid max-w-[560px] grid-cols-1 gap-5 lg:max-w-none lg:grid-cols-3">
        {LEVELS.map((l) => (
          <Box
            key={l.k}
            tone={l.solid ? "solid" : "paper"}
            className="flex flex-col"
          >
            <div className="flex flex-col gap-2 border-b-[1.5px] border-current px-6 py-5.5 in-data-[tone=solid]:border-[#333]">
              <div className="flex justify-between gap-2.5 font-mono text-[12px] tracking-label">
                <span className="font-semibold">{l.k}</span>
                <span className="opacity-70">{l.who}</span>
              </div>
              <h3 className="text-[28px] font-semibold tracking-[-0.02em]">
                {l.t}
              </h3>
              <BodyText>{l.d}</BodyText>
            </div>
            <CodeBlock className="grow">
              <CodeLines lines={l.code} />
            </CodeBlock>
          </Box>
        ))}
      </div>
    </Section>
  );
}

export { HackIt };
