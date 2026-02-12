export const GENERATION_PROMPT_INPUT_BUSY_CLASS =
  "cursor-not-allowed text-[#9CA3AF] placeholder:text-[#B8BFD6] dark:text-slate-400";

export function generationPromptInputBusyClass(
  isBusy: boolean,
): string | undefined {
  return isBusy ? GENERATION_PROMPT_INPUT_BUSY_CLASS : undefined;
}

