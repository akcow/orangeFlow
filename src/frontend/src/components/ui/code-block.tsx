import { cn } from "@/utils/utils";

type CodeBlockProps = {
  code: string;
  className?: string;
  codeClassName?: string;
  language?: string;
  showLineNumbers?: boolean;
  themeMode?: "dark" | "light";
  wrapLongLines?: boolean;
};

export function CodeBlock({
  code,
  className,
  codeClassName,
  language,
  showLineNumbers = false,
  themeMode = "dark",
  wrapLongLines = false,
}: CodeBlockProps) {
  const normalizedCode = code.replace(/\r\n/g, "\n");
  const lines = normalizedCode.split("\n");

  return (
    <pre
      className={cn(
        "m-0 overflow-auto rounded-md px-4 py-3 text-left",
        themeMode === "dark"
          ? "bg-zinc-950 text-zinc-100"
          : "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100",
        className,
      )}
      data-language={language}
    >
      <code
        className={cn(
          "block min-w-full font-mono text-sm leading-6",
          codeClassName,
        )}
      >
        {showLineNumbers
          ? lines.map((line, index) => (
              <span
                key={`${index + 1}-${line}`}
                className="grid grid-cols-[auto_1fr] gap-4"
              >
                <span
                  className={cn(
                    "select-none text-right text-xs",
                    themeMode === "dark"
                      ? "text-zinc-500"
                      : "text-zinc-400 dark:text-zinc-500",
                  )}
                >
                  {index + 1}
                </span>
                <span
                  className={cn(
                    wrapLongLines ? "whitespace-pre-wrap break-words" : "whitespace-pre",
                  )}
                >
                  {line || " "}
                </span>
              </span>
            ))
          : normalizedCode}
      </code>
    </pre>
  );
}
