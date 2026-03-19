import {
  type ClipboardEvent,
  type CompositionEvent,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/utils/utils";
import {
  buildMediaReferenceToken,
  extractMediaReferenceTrigger,
  filterMediaReferenceSuggestions,
  getMediaReferenceTokenMatches,
  renderPromptWithMediaReferenceTokens,
  type MediaReferenceKind,
  type MediaReferenceSuggestion,
  type MediaReferenceTokenMatch,
} from "./mediaReferencePromptUtils";

type MediaReferencePromptInputProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
  onChange?: TextareaHTMLAttributes<HTMLTextAreaElement>["onChange"];
  suggestions?: MediaReferenceSuggestion[];
  containerClassName?: string;
  contentClassName?: string;
  dropdownPosition?: "top" | "bottom";
  placeholderClassName?: string;
};

function getMediaReferenceDisplayLabel(
  kind: MediaReferenceKind,
  index: number,
): string {
  return `${kind === "video" ? "Video" : "Image"} ${index}`;
}

function renderTokenChip(
  kind: MediaReferenceKind,
  index: number,
  rawToken: string,
  key: string,
): ReactNode {
  const label = getMediaReferenceDisplayLabel(kind, index);
  const accentClass =
    kind === "video"
      ? "bg-sky-600 text-white"
      : "bg-emerald-600 text-white";

  return (
    <span
      key={key}
      className="relative inline-block align-middle whitespace-pre leading-6"
    >
      <span className="invisible select-none whitespace-pre">{rawToken}</span>
      <span
        className={cn(
          "absolute inset-y-[2px] left-[1px] right-[1px] inline-flex items-center gap-1 rounded-full px-1 text-[10px] font-semibold leading-none shadow-sm",
          accentClass,
        )}
      >
        <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full bg-white/18 text-white">
          {kind === "video" ? (
            <svg
              viewBox="0 0 16 16"
              className="h-2 w-2 fill-current"
              aria-hidden="true"
            >
              <path d="M5 3.5a.75.75 0 0 1 1.155-.634l5 3.25a.75.75 0 0 1 0 1.268l-5 3.25A.75.75 0 0 1 5 10V3.5Z" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 16 16"
              className="h-2 w-2 stroke-current"
              fill="none"
              aria-hidden="true"
            >
              <rect x="2.25" y="3" width="11.5" height="10" rx="2" strokeWidth="1.5" />
              <path d="M4.5 10.25 6.8 7.9a.7.7 0 0 1 1.02.03l1.42 1.58 1.27-1.2a.7.7 0 0 1 .96-.02l1.03.96" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
            </svg>
          )}
        </span>
        <span className="min-w-0 whitespace-nowrap leading-none">{label}</span>
      </span>
    </span>
  );
}

const MediaReferencePromptInput = forwardRef<
  HTMLTextAreaElement,
  MediaReferencePromptInputProps
>(
  (
    {
      value,
      onValueChange,
      suggestions = [],
      className,
      containerClassName,
      contentClassName,
      dropdownPosition = "bottom",
      placeholder,
      placeholderClassName,
      disabled,
      readOnly,
      onFocus,
      onBlur,
      onKeyDown,
      onScroll,
      onChange,
      ...props
    },
    ref,
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement, []);

    const [isFocused, setFocused] = useState(false);
    const [selection, setSelection] = useState({ start: 0, end: 0 });
    const [scrollTop, setScrollTop] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
    const [dismissedTriggerKey, setDismissedTriggerKey] = useState<string | null>(null);
    const [isComposing, setIsComposing] = useState(false);
    const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
    const tokenMatches = useMemo(() => getMediaReferenceTokenMatches(value), [value]);

    useLayoutEffect(() => {
      if (!pendingSelectionRef.current || !textareaRef.current) return;
      const nextSelection = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextSelection.start, nextSelection.end);
      setSelection(nextSelection);
    }, [value]);

    const trigger = useMemo(() => {
      if (!isFocused || disabled || readOnly || isComposing) return null;
      const resolved = extractMediaReferenceTrigger(value, selection.start);
      if (!resolved) return null;
      if (dismissedTriggerKey && dismissedTriggerKey === resolved.key) return null;
      return resolved;
    }, [
      dismissedTriggerKey,
      disabled,
      isComposing,
      isFocused,
      readOnly,
      selection.start,
      value,
    ]);

    const filteredSuggestions = useMemo(
      () =>
        trigger
          ? filterMediaReferenceSuggestions(suggestions, trigger.query)
          : [],
      [suggestions, trigger],
    );

    const isDropdownOpen = Boolean(trigger && filteredSuggestions.length > 0);

    useEffect(() => {
      setActiveSuggestionIndex(0);
    }, [trigger?.key]);

    useEffect(() => {
      if (!filteredSuggestions.length) {
        setActiveSuggestionIndex(0);
        return;
      }
      setActiveSuggestionIndex((current) =>
        Math.max(0, Math.min(current, filteredSuggestions.length - 1)),
      );
    }, [filteredSuggestions]);

    const normalizeCollapsedCaret = (caret: number) => {
      const containingToken = tokenMatches.find(
        (match) => caret > match.start && caret < match.end,
      );
      if (!containingToken) return caret;

      const distanceToStart = caret - containingToken.start;
      const distanceToEnd = containingToken.end - caret;
      return distanceToStart <= distanceToEnd
        ? containingToken.start
        : containingToken.end;
    };

    const syncSelectionFromTarget = (
      target: HTMLTextAreaElement,
      clearDismissed = false,
    ) => {
      let start = target.selectionStart ?? 0;
      let end = target.selectionEnd ?? target.selectionStart ?? 0;

      if (start === end) {
        const normalizedCaret = normalizeCollapsedCaret(start);
        if (normalizedCaret !== start) {
          target.setSelectionRange(normalizedCaret, normalizedCaret);
          start = normalizedCaret;
          end = normalizedCaret;
        }
      }

      setSelection({
        start,
        end,
      });
      if (clearDismissed) setDismissedTriggerKey(null);
    };

    const insertSuggestion = (suggestion: MediaReferenceSuggestion) => {
      if (!trigger) return;
      const replacement = buildMediaReferenceToken(
        suggestion.kind,
        suggestion.index,
      );
      const before = value.slice(0, trigger.start);
      const after = value.slice(trigger.end);
      const shouldAppendSpace =
        after.length === 0 || !/^[\s)\]}.,!?;:]/.test(after);
      const nextValue = `${before}${replacement}${shouldAppendSpace ? " " : ""}${after}`;
      const nextCaret = before.length + replacement.length + (shouldAppendSpace ? 1 : 0);

      setDismissedTriggerKey(null);
      onValueChange(nextValue);
      pendingSelectionRef.current = { start: nextCaret, end: nextCaret };
    };

    const updateValueWithSelection = (
      nextStart: number,
      nextEnd: number,
      insertedText = "",
    ) => {
      const nextValue = `${value.slice(0, nextStart)}${insertedText}${value.slice(nextEnd)}`;
      const caret = nextStart + insertedText.length;
      onValueChange(nextValue);
      pendingSelectionRef.current = { start: caret, end: caret };
    };

    const getExpandedTokenSelection = (start: number, end: number) => {
      if (start === end) return { start, end, overlapsToken: false };

      const overlappingTokens = tokenMatches.filter(
        (match) => match.start < end && match.end > start,
      );
      if (!overlappingTokens.length) {
        return { start, end, overlapsToken: false };
      }

      return {
        start: Math.min(start, ...overlappingTokens.map((match) => match.start)),
        end: Math.max(end, ...overlappingTokens.map((match) => match.end)),
        overlapsToken: true,
      };
    };

    const findTokenForBackspace = (caret: number): MediaReferenceTokenMatch | null =>
      tokenMatches.find((match) => caret > match.start && caret <= match.end) ?? null;

    const findTokenForDelete = (caret: number): MediaReferenceTokenMatch | null =>
      tokenMatches.find((match) => caret >= match.start && caret < match.end) ?? null;

    const findTokenForArrowLeft = (caret: number): MediaReferenceTokenMatch | null =>
      tokenMatches.find((match) => caret > match.start && caret <= match.end) ?? null;

    const findTokenForArrowRight = (caret: number): MediaReferenceTokenMatch | null =>
      tokenMatches.find((match) => caret >= match.start && caret < match.end) ?? null;

    const findTokenRangeBeforeTrailingWhitespace = (
      caret: number,
    ): { start: number; end: number } | null => {
      if (caret < 1) return null;
      const previousChar = value.slice(caret - 1, caret);
      if (!/\s/.test(previousChar)) return null;
      const token = tokenMatches.find((match) => match.end === caret - 1);
      if (!token) return null;
      return { start: token.start, end: caret };
    };

    const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (isComposing) {
        onKeyDown?.(event);
        return;
      }

      if (isDropdownOpen) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          setActiveSuggestionIndex((current) =>
            filteredSuggestions.length
              ? (current + 1) % filteredSuggestions.length
              : 0,
          );
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          setActiveSuggestionIndex((current) =>
            filteredSuggestions.length
              ? (current - 1 + filteredSuggestions.length) %
                filteredSuggestions.length
              : 0,
          );
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const activeSuggestion = filteredSuggestions[activeSuggestionIndex];
          if (activeSuggestion) {
            event.preventDefault();
            event.stopPropagation();
            insertSuggestion(activeSuggestion);
            return;
          }
        }
      }

      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        selection.start === selection.end
      ) {
        const caret = selection.start;
        const token =
          event.key === "ArrowLeft"
            ? findTokenForArrowLeft(caret)
            : findTokenForArrowRight(caret);

        if (token) {
          event.preventDefault();
          const nextCaret =
            event.key === "ArrowLeft" ? token.start : token.end;
          pendingSelectionRef.current = { start: nextCaret, end: nextCaret };
          setSelection({ start: nextCaret, end: nextCaret });
          textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
          return;
        }
      }

      if (event.key === "Escape" && trigger) {
        setDismissedTriggerKey(trigger.key);
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        const currentStart = selection.start;
        const currentEnd = selection.end;

        if (currentStart !== currentEnd) {
          const expandedSelection = getExpandedTokenSelection(
            currentStart,
            currentEnd,
          );
          if (expandedSelection.overlapsToken) {
            event.preventDefault();
            updateValueWithSelection(expandedSelection.start, expandedSelection.end);
            return;
          }
        } else {
          if (event.key === "Backspace") {
            const tokenWithWhitespace =
              findTokenRangeBeforeTrailingWhitespace(currentStart);
            if (tokenWithWhitespace) {
              event.preventDefault();
              updateValueWithSelection(
                tokenWithWhitespace.start,
                tokenWithWhitespace.end,
              );
              return;
            }
          }

          const token =
            event.key === "Backspace"
              ? findTokenForBackspace(currentStart)
              : findTokenForDelete(currentStart);
          if (token) {
            event.preventDefault();
            updateValueWithSelection(token.start, token.end);
            return;
          }
        }
      }

      onKeyDown?.(event);
    };

    const handleCompositionStart = (
      event: CompositionEvent<HTMLTextAreaElement>,
    ) => {
      setIsComposing(true);
      props.onCompositionStart?.(event);
    };

    const handleCompositionEnd = (
      event: CompositionEvent<HTMLTextAreaElement>,
    ) => {
      setIsComposing(false);
      syncSelectionFromTarget(event.currentTarget, true);
      props.onCompositionEnd?.(event);
    };

    const handleCopy = (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const currentStart = textareaRef.current?.selectionStart ?? selection.start;
      const currentEnd = textareaRef.current?.selectionEnd ?? selection.end;
      if (currentStart === currentEnd) {
        props.onCopy?.(event);
        return;
      }
      const expandedSelection = getExpandedTokenSelection(currentStart, currentEnd);
      if (expandedSelection.overlapsToken) {
        event.preventDefault();
        event.clipboardData.setData(
          "text/plain",
          value.slice(expandedSelection.start, expandedSelection.end),
        );
      }
      props.onCopy?.(event);
    };

    const handleCut = (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const currentStart = textareaRef.current?.selectionStart ?? selection.start;
      const currentEnd = textareaRef.current?.selectionEnd ?? selection.end;
      if (currentStart === currentEnd) {
        props.onCut?.(event);
        return;
      }
      const expandedSelection = getExpandedTokenSelection(currentStart, currentEnd);
      if (expandedSelection.overlapsToken) {
        event.preventDefault();
        event.clipboardData.setData(
          "text/plain",
          value.slice(expandedSelection.start, expandedSelection.end),
        );
        updateValueWithSelection(expandedSelection.start, expandedSelection.end);
      }
      props.onCut?.(event);
    };

    const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const currentStart = textareaRef.current?.selectionStart ?? selection.start;
      const currentEnd = textareaRef.current?.selectionEnd ?? selection.end;
      const expandedSelection = getExpandedTokenSelection(currentStart, currentEnd);
      if (expandedSelection.overlapsToken) {
        event.preventDefault();
        const pastedText = event.clipboardData.getData("text/plain");
        updateValueWithSelection(
          expandedSelection.start,
          expandedSelection.end,
          pastedText,
        );
      }
      props.onPaste?.(event);
    };

    const overlayContent = useMemo(() => {
      if (!value) {
        if (!placeholder) return null;
        return (
          <span
            className={cn(
              "select-none text-muted-foreground/80",
              placeholderClassName,
            )}
          >
            {placeholder}
          </span>
        );
      }

      return renderPromptWithMediaReferenceTokens(
        value,
        (kind, index, rawToken, key) =>
          renderTokenChip(kind, index, rawToken, key),
      );
    }, [placeholder, placeholderClassName, value]);

    return (
      <div className={cn("relative w-full", containerClassName)}>
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words",
            contentClassName,
          )}
          style={{
            transform: `translate(${-scrollLeft}px, ${-scrollTop}px)`,
          }}
        >
          {overlayContent}
          {value.endsWith("\n") ? " " : null}
        </div>

        <textarea
          {...props}
          ref={textareaRef}
          value={value}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={placeholder}
          className={cn(
            "nopan nodelete nodrag noflow nowheel bg-transparent !text-transparent caret-foreground selection:bg-[#BFD5FF]/70 selection:!text-transparent dark:selection:bg-[#244E8F]/70",
            className,
          )}
          onFocus={(event) => {
            setFocused(true);
            syncSelectionFromTarget(event.currentTarget, true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onClick={(event) => {
            syncSelectionFromTarget(event.currentTarget);
            props.onClick?.(event);
          }}
          onKeyUp={(event) => {
            syncSelectionFromTarget(event.currentTarget);
            props.onKeyUp?.(event);
          }}
          onSelect={(event) => {
            syncSelectionFromTarget(event.currentTarget);
            props.onSelect?.(event);
          }}
          onScroll={(event) => {
            setScrollTop(event.currentTarget.scrollTop);
            setScrollLeft(event.currentTarget.scrollLeft);
            onScroll?.(event);
          }}
          onChange={(event) => {
            syncSelectionFromTarget(event.currentTarget, true);
            onValueChange(event.target.value);
            onChange?.(event);
          }}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onKeyDown={handleTextareaKeyDown}
        />

        {isDropdownOpen && (
          <div
            className={cn(
              "absolute z-[70] min-w-[280px] max-w-[360px] overflow-hidden rounded-[28px] border border-white/10 bg-[#1F1F22]/95 p-2 shadow-[0_24px_60px_rgba(0,0,0,0.38)] backdrop-blur-xl",
              dropdownPosition === "top"
                ? "bottom-[calc(100%+12px)] left-0"
                : "left-0 top-[calc(100%+12px)]",
            )}
          >
            <div className="px-4 py-2 text-xs font-semibold tracking-wide text-white/55">
              Add Reference
            </div>
            <div className="space-y-1">
              {filteredSuggestions.map((suggestion, index) => {
                const active = index === activeSuggestionIndex;
                const label =
                  suggestion.label ||
                  (suggestion.kind === "video"
                    ? `Video ${suggestion.index}`
                    : `Image ${suggestion.index}`);
                return (
                  <button
                    key={suggestion.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[22px] border border-white/8 bg-[#3A3A3E] px-3 py-3 text-left transition-[background-color,border-color,transform] duration-200 ease-out",
                      active
                        ? "border-white/12 bg-[#55555A] text-white"
                        : "text-white hover:border-white/12 hover:bg-[#48484D]",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertSuggestion(suggestion);
                    }}
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-[#4B4B50]">
                      {suggestion.previewUrl ? (
                        suggestion.kind === "video" ? (
                          <video
                            src={suggestion.previewUrl}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={suggestion.previewUrl}
                            alt={suggestion.sourceLabel ?? label}
                            className="h-full w-full object-cover"
                          />
                        )
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-white/70">
                          {suggestion.kind === "video" ? (
                            <svg
                              viewBox="0 0 16 16"
                              className="h-4 w-4 fill-current"
                              aria-hidden="true"
                            >
                              <path d="M5 3.5a.75.75 0 0 1 1.155-.634l5 3.25a.75.75 0 0 1 0 1.268l-5 3.25A.75.75 0 0 1 5 10V3.5Z" />
                            </svg>
                          ) : (
                            <svg
                              viewBox="0 0 16 16"
                              className="h-4 w-4 stroke-current"
                              fill="none"
                              aria-hidden="true"
                            >
                              <rect x="2.25" y="3" width="11.5" height="10" rx="2" strokeWidth="1.5" />
                              <path d="M4.5 10.25 6.8 7.9a.7.7 0 0 1 1.02.03l1.42 1.58 1.27-1.2a.7.7 0 0 1 .96-.02l1.03.96" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
                            </svg>
                          )}
                        </span>
                      )}
                      <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[17px] font-semibold leading-6 text-white">
                        {label}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  },
);

MediaReferencePromptInput.displayName = "MediaReferencePromptInput";

export default MediaReferencePromptInput;
