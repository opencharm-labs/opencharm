import type { CliContext } from "../context";
import { LINKS } from "../links";

function runHelp(ctx: CliContext): void {
  const { bold, dim } = ctx.style;
  ctx.out.write(`
  ${bold("opencharm")} ${dim(`v${ctx.version}`)}  The open-source charm for your AI agent.

  Usage
    opencharm                 say hello
    opencharm faces           list all moods
    opencharm face [mood]     show one mood (random if omitted)
    opencharm states          agent states and their faces
    opencharm hardware        what to buy and print

  charmd, the charm daemon (runs next to your agent)
    opencharm init [dir]            clone the starter workspace for your agent [--agent claude|codex|gemini|goose|hermes|openclaw] [--from <git url>] [--name <name>] [--colour <colour>]
    opencharm setup --domain <d>    install charmd as a service (Linux, sudo)   [--dry-run]
    opencharm serve                 start charmd   [--config <file>]
    opencharm sim                   the charm on screen, in your browser   [--url <ws>] [--port <n>]
    opencharm voice                 the local voice's models   [install: download them now]
    opencharm pair <code>           pair the charm showing <code>   [--name <name>]
    opencharm status                paired charms and their state
    opencharm lock <charm>          lock a charm now
    opencharm unlock <charm>        clear a block and unlock
    opencharm revoke <charm>        forget a charm (it must pair again)
    opencharm look                  show or change the charm's look until charmd restarts   [--colour <c>] [--greeting <text>] [--motion full|calm]
    opencharm dev face <charm> <state> [text]   show a face (testing)
    opencharm dev say <charm> <text>            speak through it (testing)
    opencharm dev ask <charm> <question>        ask it; hold = yes, press = no (testing)
    opencharm mcp                    the charm's tools for an agent (MCP over stdio) [--config <file>]

  Options
    --colour <name>   white, cobalt, lime, lilac, sun, coal
    --no-anim         no blinking
    --no-color        plain text (also respects NO_COLOR)
    -v, --version     print the version
    -h, --help        this help

  ${LINKS.site}
`);
}

export { runHelp };
