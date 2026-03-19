import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import MediaReferencePromptInput from "@/components/MediaReferencePromptInput";
import {
  renderPromptWithMediaReferenceTokens,
  type MediaReferenceKind,
} from "@/components/mediaReferencePromptUtils";
import { usePostValidatePrompt } from "@/controllers/API/queries/nodes/use-post-validate-prompt";
import { t } from "@/i18n/t";
import IconComponent from "../../components/common/genericIconComponent";
import ShadTooltip from "../../components/common/shadTooltipComponent";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  BUG_ALERT,
  PROMPT_ERROR_ALERT,
  TEMP_NOTICE_ALERT,
} from "../../constants/alerts_constants";
import {
  EDIT_TEXT_PLACEHOLDER,
  INVALID_CHARACTERS,
  MAX_WORDS_HIGHLIGHT,
  regexHighlight,
} from "../../constants/constants";
import useAlertStore from "../../stores/alertStore";
import type { PromptModalType } from "../../types/components";
import { handleKeyDown } from "../../utils/reactflowUtils";
import { classNames } from "../../utils/utils";
import BaseModal from "../baseModal";

function renderPreviewTokenChip(
  kind: MediaReferenceKind,
  index: number,
  key: string,
): JSX.Element {
  const label = `${kind === "video" ? "Video" : "Image"} ${index}`;
  const accentClass =
    kind === "video"
      ? "bg-sky-600 text-white"
      : "bg-emerald-600 text-white";

  return (
    <span
      key={key}
      className={classNames(
        "inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-semibold align-middle leading-none shadow-sm",
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
      <span className="whitespace-nowrap leading-none">{label}</span>
    </span>
  );
}

function renderPreviewTextSegment(
  value: string,
  keyPrefix: string,
): React.ReactNode[] {
  if (!value) return [];

  const nodes: React.ReactNode[] = [];
  const pattern = new RegExp(regexHighlight);
  let lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(value);

  while (match) {
    const [fullMatch = "", codeFence, openRun, varName, closeRun] = match;
    const matchStart = match.index;
    const matchEnd = matchStart + fullMatch.length;

    if (matchStart > lastIndex) {
      nodes.push(value.slice(lastIndex, matchStart));
    }

    if (codeFence) {
      nodes.push(codeFence);
    } else {
      const lenOpen = openRun?.length ?? 0;
      const lenClose = closeRun?.length ?? 0;
      const isVariable = lenOpen === lenClose && lenOpen % 2 === 1;

      if (!isVariable) {
        nodes.push(fullMatch);
      } else {
        const outerCount = Math.floor(lenOpen / 2);
        if (outerCount > 0) {
          nodes.push("{".repeat(outerCount));
        }
        nodes.push(
          <span
            key={`${keyPrefix}-${matchStart}`}
            className="chat-message-highlight"
          >
            {`{${varName}}`}
          </span>,
        );
        if (outerCount > 0) {
          nodes.push("}".repeat(outerCount));
        }
      }
    }

    lastIndex = matchEnd;
    match = pattern.exec(value);
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes;
}

export default function PromptModal({
  field_name = "",
  value,
  setValue,
  nodeClass,
  setNodeClass,
  children,
  disabled,
  id = "",
  readonly = false,
  mediaSuggestions,
}: PromptModalType): JSX.Element {
  const CHECK_AND_SAVE_SUCCESS_TEXT = "妫€鏌ュ苟淇濆瓨鎴愬姛";
  const CHECK_AND_SAVE_FAILED_TEXT = "妫€鏌ュ苟淇濆瓨澶辫触";
  const [modalOpen, setModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [isEdit, setIsEdit] = useState(true);
  const [wordsHighlight, setWordsHighlight] = useState<Set<string>>(new Set());
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const setNoticeData = useAlertStore((state) => state.setNoticeData);
  const divRef = useRef(null);
  const _divRefPrompt = useRef(null);
  const { mutate: postValidatePrompt } = usePostValidatePrompt();
  const [clickPosition, setClickPosition] = useState({ x: 0, y: 0 });
  const [scrollPosition, setScrollPosition] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function checkVariables(valueToCheck: string): void {
    const regex = /(\{+)([^{}]+)(\}+)/g;
    const matches: string[] = [];
    let match: RegExpExecArray | null = regex.exec(valueToCheck);

    while (match) {
      const [openRun, varName, closeRun] = [match[1], match[2], match[3]];

      if (openRun.length === closeRun.length && openRun.length % 2 === 1) {
        matches.push(`{${varName}}`);
      }
      match = regex.exec(valueToCheck);
    }

    const invalid_chars: string[] = [];
    const fixed_variables: string[] = [];
    const input_variables = matches;
    for (const variable of input_variables) {
      const new_var = variable;
      for (const char of INVALID_CHARACTERS) {
        if (variable.includes(char)) {
          invalid_chars.push(new_var);
        }
      }
      fixed_variables.push(new_var);
      if (new_var !== variable) {
        const index = input_variables.indexOf(variable);
        if (index !== -1) {
          input_variables.splice(index, 1, new_var);
        }
      }
    }

    const filteredWordsHighlight = new Set(
      matches.filter((word) => !invalid_chars.includes(word)),
    );

    setWordsHighlight(filteredWordsHighlight);
  }

  const previewContent = useMemo(() => {
    const safeValue = typeof inputValue === "string" ? inputValue : "";
    return renderPromptWithMediaReferenceTokens(
      safeValue,
      (kind, index, _rawToken, key) =>
        renderPreviewTokenChip(kind, index, key),
    ).flatMap((node, index) =>
      typeof node === "string"
        ? renderPreviewTextSegment(node, `preview-${index}`)
        : [node],
    );
  }, [inputValue]);

  useEffect(() => {
    if (inputValue && inputValue != "") {
      checkVariables(inputValue);
    }
  }, [inputValue]);

  useEffect(() => {
    if (typeof value === "string") setInputValue(value);
  }, [value, modalOpen]);

  function getClassByNumberLength(): string {
    let sumOfCaracteres = 0;
    wordsHighlight.forEach((element) => {
      sumOfCaracteres =
        sumOfCaracteres + element.replace(/[{}]/g, "").length;
    });
    return sumOfCaracteres > MAX_WORDS_HIGHLIGHT
      ? "code-highlight"
      : "code-nohighlight";
  }

  function validatePrompt(closeModal: boolean): void {
    postValidatePrompt(
      { name: field_name, template: inputValue, frontend_node: nodeClass! },
      {
        onSuccess: (apiReturn) => {
          if (field_name === "") {
            field_name = Array.isArray(
              apiReturn?.frontend_node?.custom_fields?.[""],
            )
              ? (apiReturn?.frontend_node?.custom_fields?.[""][0] ?? "")
              : (apiReturn?.frontend_node?.custom_fields?.[""] ?? "");
          }
          if (apiReturn) {
            const inputVariables = apiReturn.input_variables ?? [];
            if (
              JSON.stringify(apiReturn?.frontend_node) !== JSON.stringify({})
            ) {
              setValue(inputValue);
              apiReturn.frontend_node.template.template.value = inputValue;
              if (setNodeClass) setNodeClass(apiReturn?.frontend_node);
              setModalOpen(closeModal);
              setIsEdit(false);
            }
            setSuccessData({ title: CHECK_AND_SAVE_SUCCESS_TEXT });
            if (!inputVariables || inputVariables.length === 0) {
              setNoticeData({ title: TEMP_NOTICE_ALERT });
            }
          } else {
            setIsEdit(true);
            setErrorData({
              title: CHECK_AND_SAVE_FAILED_TEXT,
              list: [BUG_ALERT],
            });
          }
        },
        onError: (error) => {
          setIsEdit(true);
          const detail = error?.response?.data?.detail;
          return setErrorData({
            title: CHECK_AND_SAVE_FAILED_TEXT,
            list: [detail ?? PROMPT_ERROR_ALERT],
          });
        },
      },
    );
  }

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEdit && !readonly) {
      const clickX = e.clientX;
      const clickY = e.clientY;
      setClickPosition({ x: clickX, y: clickY });
      setScrollPosition(e.currentTarget.scrollTop);
      setIsEdit(true);
    }
  };

  useEffect(() => {
    if (isEdit && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.scrollTop = scrollPosition;

      const textArea = textareaRef.current;
      const { x, y } = clickPosition;

      if ("caretPositionFromPoint" in document) {
        const range =
          (document as any).caretPositionFromPoint(x, y)?.offset ?? 0;
        if (range) {
          const position = range;
          textArea.setSelectionRange(position, position);
        }
      }
    } else if (!isEdit && previewRef.current) {
      previewRef.current.scrollTop = scrollPosition;
    }
  }, [isEdit, clickPosition, scrollPosition]);

  return (
    <BaseModal
      onChangeOpenModal={(open) => {}}
      open={modalOpen}
      setOpen={setModalOpen}
      size="x-large"
    >
      <BaseModal.Trigger disable={disabled} asChild>
        {children}
      </BaseModal.Trigger>
      <BaseModal.Header>
        <div className="flex w-full items-start gap-3">
          <div className="flex">
            <IconComponent
              name="TerminalSquare"
              className="h-6 w-6 pr-1 text-primary"
              aria-hidden="true"
            />
            <span className="pl-2" data-testid="modal-title">
              {t("Edit Prompt")}
            </span>
          </div>
        </div>
      </BaseModal.Header>
      <BaseModal.Content overflowHidden>
        <div className={classNames("flex h-full w-full rounded-lg border")}>
          {isEdit && !readonly ? (
            <MediaReferencePromptInput
              id={"modal-" + id}
              data-testid={"modal-" + id}
              ref={textareaRef}
              suggestions={mediaSuggestions}
              containerClassName="h-full"
              contentClassName="h-full w-full rounded-lg p-3 text-sm leading-6"
              className="form-input h-full w-full resize-none rounded-lg border-0 custom-scroll p-3 text-sm leading-6 focus-visible:ring-1"
              value={inputValue}
              onValueChange={(nextValue) => {
                setInputValue(nextValue);
                checkVariables(nextValue);
              }}
              onBlur={() => {
                setScrollPosition(textareaRef.current?.scrollTop || 0);
                setIsEdit(false);
              }}
              autoFocus
              placeholder={EDIT_TEXT_PLACEHOLDER}
              onKeyDown={(e) => {
                handleKeyDown(e, inputValue, "");
              }}
            />
          ) : (
            <div
              ref={previewRef}
              data-testid="edit-prompt-preview"
              className={classNames(
                getClassByNumberLength(),
                "m-0 h-full w-full overflow-y-auto custom-scroll whitespace-pre-wrap rounded-lg p-3 text-sm leading-6",
              )}
              onClick={handlePreviewClick}
            >
              {previewContent}
            </div>
          )}
        </div>
      </BaseModal.Content>
      <BaseModal.Footer>
        <div className="flex w-full shrink-0 items-end justify-between">
          <div className="mb-auto flex-1">
            <div className="mr-2">
              <div
                ref={divRef}
                className="max-h-20 overflow-y-auto custom-scroll"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <IconComponent
                    name="Braces"
                    className="flex h-4 w-4 text-primary"
                  />
                  <span className="text-md font-semibold text-primary">
                    {t("Prompt Variables:")}
                  </span>

                  {Array.from(wordsHighlight).map((word, index) => (
                    <ShadTooltip
                      key={index}
                      content={word.replace(/[{}]/g, "")}
                      asChild={false}
                    >
                      <Badge
                        key={index}
                        variant="gray"
                        size="md"
                        className="max-w-[40vw] cursor-default truncate p-1 text-sm"
                      >
                        <div className="relative bottom-[1px]">
                          <span id={"badge" + index.toString()}>
                            {word.replace(/[{}]/g, "").length > 59
                              ? word.replace(/[{}]/g, "").slice(0, 56) + "..."
                              : word.replace(/[{}]/g, "")}
                          </span>
                        </div>
                      </Badge>
                    </ShadTooltip>
                  ))}
                </div>
              </div>
              <span className="mt-2 text-xs text-muted-foreground">
                {t(
                  "Prompt variables can be created with any chosen name inside curly brackets, e.g. {{example}}",
                  { example: "{variable_name}" },
                )}
              </span>
            </div>
          </div>
          <Button
            data-testid="genericModalBtnSave"
            id="genericModalBtnSave"
            disabled={readonly}
            onClick={() => {
              validatePrompt(false);
            }}
            type="submit"
          >
            {t("Check & Save")}
          </Button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  );
}
