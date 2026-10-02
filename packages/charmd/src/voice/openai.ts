import type { VoiceProvider } from "./types";

type OpenAiVoiceOptions = {
  baseUrl?: string;
  apiKey?: string;
  sttModel?: string;
  ttsModel?: string;
  voice?: string;
};

// Models chosen in the research notes (packages/charmd/README.md); both are configurable because OpenAI renames and retires models.
function createOpenAiVoice(options: OpenAiVoiceOptions): VoiceProvider {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error(
      "The openai voice needs an API key: set voice.openai.apiKey or OPENAI_API_KEY"
    );
  const baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(
    /\/$/,
    ""
  );
  const auth = { authorization: `Bearer ${apiKey}` };
  return {
    name: "openai",
    async transcribe(ogg, signal) {
      const form = new FormData();
      form.append("model", options.sttModel ?? "gpt-4o-mini-transcribe");
      form.append(
        "file",
        new Blob([new Uint8Array(ogg)], { type: "audio/ogg" }),
        "speech.ogg"
      );
      const response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: auth,
        body: form,
        signal,
      });
      if (!response.ok)
        throw new Error(
          `Speech-to-text failed: ${response.status} ${response.statusText}`
        );
      const { text } = (await response.json()) as { text?: string };
      return (text ?? "").trim();
    },
    async synthesize(text, signal) {
      const response = await fetch(`${baseUrl}/audio/speech`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({
          model: options.ttsModel ?? "gpt-4o-mini-tts",
          input: text,
          voice: options.voice ?? "alloy",
          response_format: "opus",
        }),
        signal,
      });
      if (!response.ok)
        throw new Error(
          `Text-to-speech failed: ${response.status} ${response.statusText}`
        );
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

export { createOpenAiVoice };
export type { OpenAiVoiceOptions };
