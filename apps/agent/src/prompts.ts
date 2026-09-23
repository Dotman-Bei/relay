/**
 * Memory Steward prompt suggestions.
 *
 * Input is non-private metadata the member chooses to share (theme, occasion, group size, tone).
 * Never contributions, never keys, never the Circle's encrypted description. With no model
 * credentials configured, deterministic TEMPLATE prompts are returned instead — labelled as such.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const PromptRequestSchema = z
  .object({
    theme: z.string().trim().min(1).max(80),
    occasion: z.string().trim().max(80).default(""),
    groupSize: z.number().int().min(2).max(64),
    yearsUntilOpen: z.number().min(0).max(100),
    tone: z.enum(["warm", "funny", "reflective", "practical"]).default("warm"),
  })
  .strict();
export type PromptRequest = z.infer<typeof PromptRequestSchema>;

export const PromptSetSchema = z.object({
  prompts: z
    .array(
      z.object({
        title: z.string(),
        prompt: z.string(),
        format: z.enum(["text", "image", "audio", "video"]),
      }),
    )
    .min(3)
    .max(6),
});
export type PromptSet = z.infer<typeof PromptSetSchema>;

export const MODEL = "claude-opus-5";

const SYSTEM = `You are the Memory Steward for Relay, a group time-capsule app. A group writes or records
contributions now; everyone opens them together on a future date.

You suggest contribution prompts. You only ever see the group's chosen theme, occasion, size, tone and
how many years until opening — never anyone's contributions. Write prompts a person can answer alone in
five to fifteen minutes, that will mean more when read years later, and that don't require sharing
anything they'd regret. Mix formats (a letter, a photo, a voice memo, a short video). Keep each prompt
under 40 words. Do not ask for passwords, addresses, financial, medical or other sensitive details.`;

export function templatePrompts(req: PromptRequest): PromptSet {
  const years = req.yearsUntilOpen >= 1 ? `${Math.round(req.yearsUntilOpen)} years` : "a while";
  const t = req.theme.toLowerCase();
  return {
    prompts: [
      { title: "A letter forward", prompt: `Write to the version of this group that opens this in ${years}. What do you hope has changed about ${t}, and what do you hope hasn't?`, format: "text" },
      { title: "One ordinary photo", prompt: `Photograph something completely ordinary from this week that you suspect you'll miss. Say in one line why.`, format: "image" },
      { title: "Voice of now", prompt: `Record a 60-second voice memo about where you are right now: the room, the sound, what you had for lunch.`, format: "audio" },
      { title: "A small prediction", prompt: `Make one specific, checkable prediction about ${t} for the day this opens. Put a number or a name in it.`, format: "text" },
      { title: "Thank someone", prompt: `Name someone in this group of ${req.groupSize} and tell them one thing they did that you never said thank you for.`, format: "text" },
    ],
  };
}

export async function suggestPrompts(req: PromptRequest, client: Anthropic | null): Promise<{ mode: "MODEL" | "TEMPLATE"; set: PromptSet; note?: string }> {
  if (!client) return { mode: "TEMPLATE", set: templatePrompts(req) };
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: zodOutputFormat(PromptSetSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Theme: ${req.theme}\nOccasion: ${req.occasion || "(none given)"}\nGroup size: ${req.groupSize}\nYears until opening: ${req.yearsUntilOpen}\nTone: ${req.tone}\n\nSuggest four or five prompts.`,
      },
    ],
  });
  if (response.stop_reason === "refusal") {
    return { mode: "TEMPLATE", set: templatePrompts(req), note: "The model declined; template prompts shown instead." };
  }
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed = PromptSetSchema.safeParse(JSON.parse(text));
  if (!parsed.success) return { mode: "TEMPLATE", set: templatePrompts(req), note: "Model output did not match the schema; template prompts shown instead." };
  return { mode: "MODEL", set: parsed.data };
}

export function modelClient(): Anthropic | null {
  const configured = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE;
  if (process.env.STEWARD_MODEL === "off" || !configured) return null;
  return new Anthropic();
}
