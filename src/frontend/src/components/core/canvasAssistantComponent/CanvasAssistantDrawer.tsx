import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import { BASE_URL_API } from "@/constants/constants";
import { api } from "@/controllers/API/api";
import { STORYBOARD_SYSTEM_PROMPT } from "@/components/core/canvasAssistantComponent/prompts/storyboardSystemPrompt";
import useAuthStore from "@/stores/authStore";
import {
  useCanvasAssistantStore,
  type CanvasAssistantConversationMode,
  type CanvasAssistantMessage,
  type CanvasAssistantSession,
} from "@/stores/canvasAssistantStore";
import { cn } from "@/utils/utils";

type ConversationMode = CanvasAssistantConversationMode;

type AttachmentPayload = {
  name: string;
  mimeType: string;
  size: number;
  dataBase64: string;
};

const MAX_FILES = 10;
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB per file (base64 expansion happens later)
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25MB total (rough safeguard)

const STORYBOARD_EXAMPLE_POOL: string[] = [
  "请把“防晒霜”做成 30 秒电商短视频分镜：卖点是“清爽不黏”和“高倍防护”，画幅 9:16，节奏快，字幕要卡点出现。",
  "帮我把一个 45 秒的新品手机广告拆成 12–16 个镜头：主打“夜景拍摄”和“防抖”，风格冷酷未来感，平台 YouTube 16:9。",
  "我想做一支 60 秒竖屏漫剧：女主在地铁里发现一条神秘短信，节奏紧张但有幽默反转。请标注对白与字幕出现时机。",
  "把这段故事改成 90 秒动画短片分镜：一只小猫在雨夜找回丢失的红围巾。要求温暖治愈、色彩偏橘黄、音乐渐强。",
  "做一支 20 秒预告片分镜：末日城市里两人擦肩而过但不相认，情绪克制、镜头缓慢推进，结尾留悬念。",
  "帮我设计一个 15 秒产品开箱短片分镜：无线耳机，强调“降噪”和“续航”，画面干净极简，适合抖音 9:16。",
  "我要一支 30 秒品牌 TVC：主题“回家”，镜头温暖写实，包含 1 个城市建立镜头、1 个室内对话、1 个手部细节特写。",
  "请把一个 40 秒教学类视频拆分分镜：教新手 3 步做手冲咖啡；每个步骤给镜头、字幕、手部细节和转场建议。",
  "我想做 25 秒 MV 段落分镜：舞者在空旷仓库里独舞，光线硬朗，镜头更多手持与环绕，按节拍切。",
  "帮我把一句口播脚本拆成分镜：内容是“会员 7 天免费试用”，要求 10–12 镜头，结尾 CTA 明确，风格轻松幽默。",
  "做一支 50 秒微电影分镜：父子误会→和解，尽量少对白，用眼神和动作推进，镜头克制但有情绪爆点。",
  "请把这张参考图延展成 12 个关键镜头分镜（保持人物与环境连续性），总时长 15 秒，输出每镜头画面与相机信息。",
];

function pickRandomDistinct<T>(arr: T[], count: number): T[] {
  if (count <= 0) return [];
  const copy = arr.slice();
  // Fisher–Yates shuffle (in-place)
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

type StoryboardJson = {
  type: "storyboard";
  status?: "need_info" | "ready" | string;
  title?: string;
  video?: {
    format?: string;
    platform?: string;
    duration_sec?: number;
    genre?: string;
  };
  creative?: {
    logline?: string;
    tone_keywords?: string[];
    visual_style?: string;
    color_light?: string;
    references?: string[];
  };
  clarifying_questions?: string[];
  assumptions?: string[];
  beats?: Array<{ name?: string; time_range?: string; goal?: string }>;
  shots?: Array<{
    id?: number;
    time_range?: string;
    duration_sec?: number;
    summary?: string;
    shot_size?: string;
    camera?: { angle?: string; movement?: string; lens_mm?: string; focus?: string };
    scene?: { location?: string; time_of_day?: string; lighting?: string };
    visual?: string;
    audio?: { dialogue_or_vo?: string; sfx?: string; music?: string };
    on_screen_text?: string;
    transition_in?: string;
    transition_out?: string;
    vfx?: string;
    notes?: string;
  }>;
  deliverables?: { shot_count?: number; estimated_total_sec?: number };
};

function extractJsonCodeBlock(text: string): string | null {
  const m = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (m?.[1]) return m[1].trim();
  return null;
}

function tryParseStoryboard(text: string): StoryboardJson | null {
  const raw = extractJsonCodeBlock(text);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    if ((obj as any).type !== "storyboard") return null;
    return obj as StoryboardJson;
  } catch {
    return null;
  }
}

function ShotRow({ label, value }: { label: string; value: string | null | undefined }): JSX.Element | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  return (
    <div className="flex gap-2 text-xs leading-relaxed">
      <div className="w-[72px] shrink-0 text-muted-foreground">{label}</div>
      <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">{v}</div>
    </div>
  );
}

function nowId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function modeLabel(mode: ConversationMode): string {
  switch (mode) {
    case "storyboard":
      return "分镜策划";
    case "moodboard":
      return "情绪板";
    case "inspiration_film":
      return "电影镜头灵感";
    case "inspiration_mj":
      return "MJ 风格";
    case "inspiration_unsplash":
      return "Unsplash 图片";
    case "inspiration_ad":
      return "广告视频灵感";
    case "inspiration_stream":
      return "流媒体视频";
    case "chat":
    default:
      return "对话模式";
  }
}

function speedLabel(model: "gemini-3-pro-preview" | "gemini-3-flash-preview"): string {
  return model === "gemini-3-flash-preview" ? "极速模式" : "思考模式";
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

async function fileToBase64Payload(file: File): Promise<AttachmentPayload> {
  const url = await readFileAsDataURL(file);
  const idx = url.indexOf("base64,");
  if (idx === -1) throw new Error("文件编码失败");
  const dataBase64 = url.slice(idx + "base64,".length).trim();
  return { name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, dataBase64 };
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0B";
  const kb = 1024;
  const mb = kb * 1024;
  if (bytes >= mb) return `${(bytes / mb).toFixed(1)}MB`;
  if (bytes >= kb) return `${Math.round(bytes / kb)}KB`;
  return `${bytes}B`;
}

function sessionTitle(session: CanvasAssistantSession): string {
  const t = String(session.title ?? "").trim();
  if (t) return t;
  const firstUser = (session.messages ?? []).find(
    (m) => m.role === "user" && String(m.content ?? "").trim(),
  );
  const raw = String(firstUser?.content ?? "").trim();
  if (!raw) return "新对话";
  const oneLine = raw.replace(/\s+/g, " ").trim();
  return oneLine.length > 18 ? `${oneLine.slice(0, 18)}...` : oneLine;
}

export default function CanvasAssistantDrawer(): JSX.Element | null {
  const open = useCanvasAssistantStore((s) => s.open);
  const setOpen = useCanvasAssistantStore((s) => s.setOpen);
  const drawerWidth = useCanvasAssistantStore((s) => s.drawerWidth);
  const setDrawerWidth = useCanvasAssistantStore((s) => s.setDrawerWidth);
  const activeFlowId = useCanvasAssistantStore((s) => s.activeFlowId);
  const selectedModel = useCanvasAssistantStore((s) => s.selectedModel);
  const setSelectedModel = useCanvasAssistantStore((s) => s.setSelectedModel);
  const conversationMode = useCanvasAssistantStore((s) => s.conversationMode);
  const setConversationMode = useCanvasAssistantStore((s) => s.setConversationMode);
  const filePickerRequestId = useCanvasAssistantStore((s) => s.filePickerRequestId);
  const sessionsByFlowId = useCanvasAssistantStore((s) => s.sessionsByFlowId);
  const activeSessionIdByFlowId = useCanvasAssistantStore(
    (s) => s.activeSessionIdByFlowId,
  );
  const ensureSession = useCanvasAssistantStore((s) => s.ensureSession);
  const startNewSession = useCanvasAssistantStore((s) => s.startNewSession);
  const switchSession = useCanvasAssistantStore((s) => s.switchSession);
  const appendMessage = useCanvasAssistantStore((s) => s.appendMessage);
  const setSessionTitle = useCanvasAssistantStore((s) => s.setSessionTitle);
  const setSessionTitleStatus = useCanvasAssistantStore((s) => s.setSessionTitleStatus);
  const clearHistory = useCanvasAssistantStore((s) => s.clearHistory);
  const pendingAttachmentsByFlowId = useCanvasAssistantStore((s) => s.pendingAttachmentsByFlowId);
  const addPendingAttachments = useCanvasAssistantStore((s) => s.addPendingAttachments);
  const removePendingAttachment = useCanvasAssistantStore((s) => s.removePendingAttachment);
  const clearPendingAttachments = useCanvasAssistantStore((s) => s.clearPendingAttachments);

  const username = useAuthStore((s) => s.userData?.username) ?? "朋友";
  const [storyboardExamplesSeed, setStoryboardExamplesSeed] = useState<number>(0);
  const storyboardExamples = useMemo(() => {
    // seed forces re-pick when user re-enters storyboard mode, but stays stable during typing.
    return pickRandomDistinct(STORYBOARD_EXAMPLE_POOL, 3);
  }, [storyboardExamplesSeed]);

  useEffect(() => {
    if (conversationMode !== "storyboard") return;
    setStoryboardExamplesSeed(Date.now());
  }, [conversationMode]);

  const sessions = useMemo(() => {
    if (!activeFlowId) return [];
    return sessionsByFlowId[activeFlowId] ?? [];
  }, [activeFlowId, sessionsByFlowId]);

  const activeSessionId = useMemo(() => {
    if (!activeFlowId) return null;
    return activeSessionIdByFlowId[activeFlowId] ?? sessions[0]?.id ?? null;
  }, [activeFlowId, activeSessionIdByFlowId, sessions]);

  const activeSession = useMemo(() => {
    if (!activeSessionId) return null;
    return (sessions.find((s) => s.id === activeSessionId) ?? null) as
      | CanvasAssistantSession
      | null;
  }, [activeSessionId, sessions]);

  const messages = useMemo(() => activeSession?.messages ?? [], [activeSession]);
  const isHistoryEmpty = useMemo(() => {
    if (sessions.length === 0) return true;
    return sessions.every((s) => (s.messages ?? []).length === 0);
  }, [sessions]);

  const pendingFiles = useMemo(() => {
    if (!activeFlowId) return [];
    return pendingAttachmentsByFlowId[activeFlowId] ?? [];
  }, [activeFlowId, pendingAttachmentsByFlowId]);

  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  // Keep the portal mounted briefly after closing so the exit animation is visible.
  const [present, setPresent] = useState(open);
  const closeTimerRef = useRef<number | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastFilePickerRequestId = useRef<number>(0);
  const isResizingRef = useRef(false);
  const titleGenAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorText(null);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    return () => {
      titleGenAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    // Ensure exit animation is visible even if Radix unmounts quickly.
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (open) {
      setPresent(true);
      return;
    }
    closeTimerRef.current = window.setTimeout(() => {
      setPresent(false);
      closeTimerRef.current = null;
    }, 300);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!activeFlowId) return;
    ensureSession(activeFlowId);
  }, [activeFlowId, ensureSession, open]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, messages.length]);

  useEffect(() => {
    if (!open) return;
    if (filePickerRequestId === lastFilePickerRequestId.current) return;
    lastFilePickerRequestId.current = filePickerRequestId;
    // Open native picker on request (grid+ button).
    fileInputRef.current?.click();
  }, [filePickerRequestId, open]);

  useEffect(() => {
    // Clamp drawer width on window resize.
    const clamp = () => {
      const max = Math.floor(window.innerWidth * 0.92);
      const next = Math.max(480, Math.min(drawerWidth, Math.min(920, max)));
      if (next !== drawerWidth) setDrawerWidth(next);
    };
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [drawerWidth, setDrawerWidth]);

  const startResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!open) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth = drawerWidth;
      isResizingRef.current = true;

      // Avoid text selection during drag.
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      const maxWidth = () => Math.floor(window.innerWidth * 0.92);
      const clampWidth = (w: number) =>
        Math.max(480, Math.min(w, Math.min(920, maxWidth())));

      const onMove = (ev: PointerEvent) => {
        if (!isResizingRef.current) return;
        const dx = startX - ev.clientX; // drag left -> increase width
        const next = clampWidth(startWidth + dx);
        setDrawerWidth(next);
      };

      const onUp = () => {
        isResizingRef.current = false;
        document.body.style.userSelect = prevUserSelect;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [drawerWidth, open, setDrawerWidth],
  );

  const maybeGenerateTitle = useCallback(
    async (flowId: string, sessionId: string | null, seed: string) => {
      if (!sessionId) return;
      const trimmedSeed = String(seed ?? "").trim();
      if (!trimmedSeed) return;

      const state = useCanvasAssistantStore.getState();
      const sessions = state.sessionsByFlowId[flowId] ?? [];
      const session = sessions.find((s) => s.id === sessionId) ?? null;
      if (!session) return;
      if (String(session.title ?? "").trim()) return;
      if (session.titleStatus === "generating") return;

      setSessionTitleStatus(flowId, sessionId, "generating");

      titleGenAbortRef.current?.abort();
      const ac = new AbortController();
      titleGenAbortRef.current = ac;

      const modeHint = modeLabel(conversationMode);

      try {
        const resp = await api.post(
          `${BASE_URL_API}canvas-assistant/chat`,
          {
            model: "gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content:
                  "你是一个中文标题生成器。根据用户需求生成一个简短的对话标题：10-18个汉字左右；不要引号；不要句号逗号等标点；不要换行；只输出标题本身。",
              },
              {
                role: "user",
                content: `模式：${modeHint}\n用户需求：${trimmedSeed}`,
              },
            ],
            temperature: 0.2,
          },
          { signal: ac.signal as any },
        );

        let title = String(resp?.data?.content ?? "").trim();
        title = title.replace(/^["“”']+|["“”']+$/g, "").trim();
        title = title.replace(/[\r\n]+/g, " ").trim();
        title = title.replace(/[，。、“”‘’：:；;！？!?]/g, "").trim();
        if (title.length > 18) title = `${title.slice(0, 18)}...`;
        if (!title) throw new Error("empty-title");

        setSessionTitle(flowId, sessionId, title);
      } catch {
        setSessionTitleStatus(flowId, sessionId, "error");
      }
    },
    [conversationMode, setSessionTitle, setSessionTitleStatus],
  );

  const onPickFiles = useCallback(
    (files: FileList | null) => {
      if (!activeFlowId) {
        setErrorText("未找到当前画布（Flow ID）。请刷新后重试。");
        return;
      }
      if (!files || files.length === 0) return;

      const selected = Array.from(files).slice(0, MAX_FILES);
      const filtered: File[] = [];
      let total = pendingFiles.reduce((sum, f) => sum + (f?.size ?? 0), 0);

      for (const f of selected) {
        if (!f.type || (!f.type.startsWith("image/") && !f.type.startsWith("video/"))) {
          setErrorText("仅支持上传图片/视频。");
          continue;
        }
        if (f.size > MAX_FILE_BYTES) {
          setErrorText(`单个文件过大（>${formatBytes(MAX_FILE_BYTES)}）：${f.name}`);
          continue;
        }
        if (total + f.size > MAX_TOTAL_BYTES) {
          setErrorText(`附件总大小超过上限（${formatBytes(MAX_TOTAL_BYTES)}）。`);
          break;
        }
        total += f.size;
        filtered.push(f);
      }

      if (filtered.length > 0) {
        addPendingAttachments(activeFlowId, filtered);
      }
    },
    [activeFlowId, addPendingAttachments, pendingFiles],
  );

  const send = useCallback(async () => {
    const flowId = activeFlowId;
    if (!flowId) {
      setErrorText("未找到当前画布（Flow ID）。请刷新后重试。");
      return;
    }
    if (isSending) return;

    const content = draft.trim();
    const hasFiles = pendingFiles.length > 0;
    if (!content && !hasFiles) return;

    setErrorText(null);
    setIsSending(true);

    const attachmentsMeta =
      pendingFiles.length > 0
        ? pendingFiles.map((f) => ({
            name: f.name,
            mimeType: f.type || "application/octet-stream",
            size: f.size,
          }))
        : undefined;

    const userMsg: CanvasAssistantMessage = {
      id: nowId(),
      role: "user",
      content,
      mode: conversationMode,
      createdAt: Date.now(),
      attachments: attachmentsMeta,
    };

    // Keep UI responsive: append immediately, then call API.
    appendMessage(flowId, userMsg);

    try {
      const attachmentsPayload: AttachmentPayload[] = hasFiles
        ? await Promise.all(pendingFiles.map((f) => fileToBase64Payload(f)))
        : [];

      const requestMessages: any[] = [];
      if (conversationMode === "storyboard") {
        requestMessages.push({ role: "system", content: STORYBOARD_SYSTEM_PROMPT });
      }
      requestMessages.push(
        ...messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      );
      requestMessages.push({
        role: "user",
        content,
        ...(attachmentsPayload.length > 0 ? { attachments: attachmentsPayload } : {}),
      } as any);

      const resp = await api.post(`${BASE_URL_API}canvas-assistant/chat`, {
        model: selectedModel,
        messages: requestMessages,
        temperature: 0.7,
      });

      const text = String(resp?.data?.content ?? "").trim();
      if (!text) throw new Error("模型返回为空。");

       appendMessage(flowId, {
          id: nowId(),
          role: "assistant",
          content: text,
          mode: conversationMode,
          createdAt: Date.now(),
        });

        // Best-effort: generate a short topic title for this session (helps the history dropdown).
        // Use the current input as the seed so we don't depend on store refresh timing.
        void maybeGenerateTitle(flowId, activeSessionId, content);

      setDraft("");
      clearPendingAttachments(flowId);
    } catch (e: any) {
      const detail =
        String(e?.response?.data?.detail ?? e?.message ?? "").trim() ||
        "请求失败，请稍后再试。";
      setErrorText(detail);
    } finally {
      setIsSending(false);
    }
  }, [
    activeFlowId,
    appendMessage,
    clearPendingAttachments,
    conversationMode,
    draft,
    isSending,
    messages,
    maybeGenerateTitle,
    pendingFiles,
    selectedModel,
    activeSessionId,
  ]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      {present && (
        <DialogPrimitive.Portal>
          <div
            className={cn(
              "nopan nodelete nodrag noflow fixed inset-0 z-50 flex items-stretch justify-end",
              // Don't block canvas interactions while the drawer is closing.
              open ? "pointer-events-auto" : "pointer-events-none",
            )}
          >
          <DialogPrimitive.Overlay
            className={cn(
              "fixed inset-0 bg-black/30",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
              // Make close/open transitions more noticeable.
              "duration-300 ease-in-out",
              "data-[state=closed]:pointer-events-none",
            )}
          />
          <DialogPrimitive.Content
            className={cn(
              "relative h-full border-l bg-background shadow-xl",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
              // Make close/open transitions more noticeable.
              "duration-300 ease-in-out",
              "data-[state=closed]:pointer-events-none",
              "flex flex-col",
            )}
            style={{ width: drawerWidth, maxWidth: "92vw" }}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              className={cn(
                "absolute left-0 top-0 h-full w-2 cursor-col-resize",
                "bg-transparent",
              )}
              onPointerDown={startResize}
              title="拖动调整宽度"
              data-testid="canvas-assistant-resize-handle"
            >
              <div className="absolute left-0 top-0 h-full w-px bg-border/60 opacity-0 transition-opacity hover:opacity-100" />
            </div>

            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="text-xl font-semibold leading-tight">
                  {activeSession ? sessionTitle(activeSession) : "对话"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    if (!activeFlowId) return;
                    startNewSession(activeFlowId);
                    setDraft("");
                    clearPendingAttachments(activeFlowId);
                    setErrorText(null);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  title="新建对话"
                  disabled={!activeFlowId}
                >
                  <IconComponent
                    name="MessageSquarePlus"
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="历史记录"
                    >
                      <IconComponent
                        name="History"
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="bottom"
                    align="end"
                    className="w-[340px] max-w-[82vw] rounded-2xl p-2"
                  >
                    <DropdownMenuLabel className="px-2 py-1.5 text-xs text-muted-foreground">
                      当前画布历史记录
                    </DropdownMenuLabel>
                    <div className="max-h-[60vh] overflow-y-auto pr-1">
                      {isHistoryEmpty ? (
                        <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                          暂无历史记录
                        </div>
                      ) : (
                        sessions.map((s) => (
                          <DropdownMenuItem
                            key={s.id}
                            className="flex items-center gap-2 rounded-xl"
                            onClick={() => {
                              if (!activeFlowId) return;
                              switchSession(activeFlowId, s.id);
                              setTimeout(() => inputRef.current?.focus(), 0);
                            }}
                          >
                            <IconComponent
                              name={s.id === activeSessionId ? "Check" : "MessageCircle"}
                              className="h-4 w-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm">
                                {s.titleStatus === "generating"
                                  ? "生成标题中..."
                                  : sessionTitle(s)}
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                {(s.messages ?? []).length} 条消息
                              </div>
                            </div>
                          </DropdownMenuItem>
                        ))
                      )}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="rounded-xl"
                      onClick={() => activeFlowId && clearHistory(activeFlowId)}
                      disabled={
                        !activeFlowId ||
                        isHistoryEmpty
                      }
                    >
                      <IconComponent
                        name="Trash2"
                        className="mr-2 h-4 w-4"
                        aria-hidden="true"
                      />
                      清空历史记录
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <div className="mt-8">
                  <div className="text-3xl font-semibold tracking-tight">
                    Hi, {username}
                  </div>
                  <div className="mt-2 text-lg text-muted-foreground">在寻找哪方面的灵感？</div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {messages.map((m) => {
                    const isUser = m.role === "user";
                    const storyboard = !isUser ? tryParseStoryboard(m.content) : null;
                    return (
                      <div key={m.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[90%] rounded-2xl text-sm break-words",
                            storyboard ? "px-2 py-2" : "px-3 py-2 whitespace-pre-wrap",
                            isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                          )}
                        >
                          {storyboard ? (
                            <div className="min-w-0">
                              <div className="text-xs text-muted-foreground">
                                {storyboard.status === "need_info"
                                  ? "为了更贴合你的需求，我需要先确认几个问题。"
                                  : "正在推敲分镜...完成啦，分镜准备就绪。"}
                              </div>

                              <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border bg-background/40 px-3 py-1 text-xs">
                                <IconComponent name="Film" className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                                <span className="truncate">
                                  {String(storyboard.title || storyboard.video?.genre || "分镜策划").trim() || "分镜策划"}
                                </span>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-muted-foreground">
                                  {(storyboard.shots?.length ?? 0) > 0 ? `${storyboard.shots?.length} 镜头` : "镜头待定"}
                                </span>
                              </div>

                              {(storyboard.clarifying_questions?.length ?? 0) > 0 && (
                                <div className="mt-3 space-y-1">
                                  {storyboard.clarifying_questions?.slice(0, 8).map((q, idx) => (
                                    <div key={`${idx}-${q}`} className="text-xs">
                                      {idx + 1}. {q}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {(storyboard.shots?.length ?? 0) > 0 && (
                                <div className="mt-3 rounded-xl border bg-background/40">
                                  <Accordion type="multiple" className="w-full">
                                    {storyboard.shots?.map((s, idx) => {
                                      const id = Number(s.id ?? idx + 1);
                                      const visual = String(s.visual ?? "").trim();
                                      const summary = String(s.summary ?? "").trim();
                                      const triggerText = summary
                                        ? `【画面】${summary}`
                                        : visual
                                          ? `【画面】${visual}`
                                          : "【画面】（未填写）";
                                      return (
                                        <AccordionItem key={id} value={`shot-${id}`} className="border-b last:border-b-0">
                                          <AccordionTrigger className="px-3 py-0">
                                            <div className="flex min-w-0 flex-1 items-center gap-2 py-3">
                                              <div className="shrink-0 text-xs text-muted-foreground">{id}.</div>
                                              <div className="min-w-0 flex-1">
                                                <div className="line-clamp-2 text-left text-sm">{triggerText}</div>
                                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                                  {s.time_range && <span>{s.time_range}</span>}
                                                  {typeof s.duration_sec === "number" && s.duration_sec > 0 && (
                                                    <span>{s.duration_sec}s</span>
                                                  )}
                                                  {s.shot_size && <span>{s.shot_size}</span>}
                                                </div>
                                              </div>
                                            </div>
                                          </AccordionTrigger>
                                          <AccordionContent className="px-3 pb-3">
                                            <div className="space-y-2">
                                              <ShotRow label="概述" value={s.summary} />
                                              <ShotRow label="画面" value={s.visual} />
                                              <ShotRow
                                                label="相机"
                                                value={[
                                                  s.camera?.angle,
                                                  s.camera?.movement,
                                                  s.camera?.lens_mm ? `镜头：${s.camera?.lens_mm}` : "",
                                                  s.camera?.focus ? `对焦：${s.camera?.focus}` : "",
                                                ]
                                                  .filter(Boolean)
                                                  .join(" / ")}
                                              />
                                              <ShotRow
                                                label="场景"
                                                value={[
                                                  s.scene?.location,
                                                  s.scene?.time_of_day,
                                                  s.scene?.lighting,
                                                ]
                                                  .filter(Boolean)
                                                  .join(" / ")}
                                              />
                                              <ShotRow label="对白/旁白" value={s.audio?.dialogue_or_vo} />
                                              <ShotRow label="音效" value={s.audio?.sfx} />
                                              <ShotRow label="音乐" value={s.audio?.music} />
                                              <ShotRow label="屏幕文字" value={s.on_screen_text} />
                                              <ShotRow label="入场转场" value={s.transition_in} />
                                              <ShotRow label="出场转场" value={s.transition_out} />
                                              <ShotRow label="特效" value={s.vfx} />
                                              <ShotRow label="备注" value={s.notes} />
                                            </div>
                                          </AccordionContent>
                                        </AccordionItem>
                                      );
                                    })}
                                  </Accordion>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>{m.content}</div>
                          )}
                          {m.attachments && m.attachments.length > 0 && (
                            <div className={cn("mt-2 text-xs", isUser ? "text-primary-foreground/80" : "text-muted-foreground")}>
                              附件：{m.attachments.map((a) => a.name).join("，")}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {isSending && conversationMode === "storyboard" && (
                    <div className="flex justify-start">
                      <div className="max-w-[90%] rounded-2xl bg-muted px-3 py-2 text-sm text-foreground">
                        <div className="flex items-center gap-2">
                          <IconComponent
                            name="LoaderCircle"
                            className="h-4 w-4 animate-spin text-muted-foreground"
                            aria-hidden="true"
                          />
                          <div className="text-muted-foreground">正在推敲分镜...</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t px-4 py-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  onPickFiles(e.target.files);
                  // allow picking the same file again
                  e.currentTarget.value = "";
                }}
              />

              {errorText && (
                <div className="mb-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {errorText}
                </div>
              )}

              <div className="rounded-2xl border bg-background p-3">
                {conversationMode === "storyboard" && draft.trim().length === 0 && pendingFiles.length === 0 && (
                  <div className="mb-2">
                    <div className="text-xs text-muted-foreground">您可以这样提问</div>
                    <div className="mt-2 space-y-1">
                      {storyboardExamples.map((ex, idx) => (
                        <button
                          key={`${idx}-${ex.slice(0, 8)}`}
                          type="button"
                          className="flex w-full items-start gap-2 rounded-xl p-2 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setDraft(ex);
                            setTimeout(() => inputRef.current?.focus(), 0);
                          }}
                          title="点击填入示例"
                        >
                          <IconComponent name="ArrowUpRight" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="line-clamp-2 leading-relaxed">{ex}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    conversationMode === "storyboard"
                      ? "说说你的创意/故事/卖点，我来拆成看得见的线稿镜头与画面节奏（支持广告/预告片/动画/漫剧/微电影等）。"
                      : "开启你的灵感之旅"
                  }
                  className="min-h-[44px] resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />

                {pendingFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pendingFiles.map((f, idx) => (
                      <div
                        key={`${f.name}-${idx}`}
                        className="flex max-w-full items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs"
                      >
                        <span className="truncate">
                          {f.name} ({formatBytes(f.size)})
                        </span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => activeFlowId && removePendingAttachment(activeFlowId, idx)}
                          title="移除附件"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-xl border border-border bg-background hover:bg-muted"
                      onClick={() => fileInputRef.current?.click()}
                      title="上传附件"
                    >
                      <IconComponent name="Plus" className="h-4 w-4" aria-hidden="true" />
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className={cn(
                            "group h-9 gap-2 rounded-full border px-3",
                            conversationMode === "chat"
                              ? "border-border bg-background hover:bg-muted"
                              : "border-blue-600 bg-blue-600 text-white hover:bg-blue-600/90",
                          )}
                          title="选择对话模式"
                        >
                          <IconComponent
                            name={conversationMode === "storyboard" ? "Film" : "MessageCircle"}
                            className={cn("h-4 w-4", conversationMode === "chat" ? "" : "text-white")}
                            aria-hidden="true"
                          />
                          <span className="text-sm">{modeLabel(conversationMode)}</span>
                          {conversationMode !== "chat" && (
                            <span
                              role="button"
                              tabIndex={0}
                              className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 hover:bg-white/30"
                              title="取消模式"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setConversationMode("chat");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setConversationMode("chat");
                                }
                              }}
                            >
                              <IconComponent name="X" className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                            </span>
                          )}
                          <IconComponent
                            name="ChevronDown"
                            className={cn(
                              "h-4 w-4 opacity-70 transition-transform duration-200",
                              "group-data-[state=open]:rotate-180",
                            )}
                            aria-hidden="true"
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="top" align="start" className="min-w-[240px] rounded-2xl p-2">
                        <DropdownMenuItem
                          className="rounded-xl"
                          onClick={() => setConversationMode("storyboard")}
                        >
                          <IconComponent name="Film" className="mr-2 h-4 w-4" aria-hidden="true" />
                          分镜策划
                          <span className="ml-auto text-xs text-muted-foreground">1min</span>
                          {conversationMode === "storyboard" && (
                            <IconComponent name="Check" className="ml-2 h-4 w-4" aria-hidden="true" />
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="rounded-xl"
                          onClick={() => setConversationMode("moodboard")}
                        >
                          <IconComponent name="LayoutGrid" className="mr-2 h-4 w-4" aria-hidden="true" />
                          情绪板
                          <span className="ml-auto text-xs text-muted-foreground">30s</span>
                          {conversationMode === "moodboard" && (
                            <IconComponent name="Check" className="ml-2 h-4 w-4" aria-hidden="true" />
                          )}
                        </DropdownMenuItem>

                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="rounded-xl">
                            <IconComponent name="Image" className="mr-2 h-4 w-4" aria-hidden="true" />
                            寻找灵感
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="min-w-[240px] rounded-2xl p-2">
                            <DropdownMenuItem
                              className="rounded-xl"
                              onClick={() => setConversationMode("inspiration_film")}
                            >
                              <IconComponent name="Clapperboard" className="mr-2 h-4 w-4" aria-hidden="true" />
                              电影镜头灵感
                              <span className="ml-auto text-xs text-muted-foreground">30s</span>
                              {conversationMode === "inspiration_film" && (
                                <IconComponent name="Check" className="ml-2 h-4 w-4" aria-hidden="true" />
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-xl"
                              onClick={() => setConversationMode("inspiration_mj")}
                            >
                              <IconComponent name="Wand2" className="mr-2 h-4 w-4" aria-hidden="true" />
                              MJ 风格
                              <span className="ml-auto text-xs text-muted-foreground">30s</span>
                              {conversationMode === "inspiration_mj" && (
                                <IconComponent name="Check" className="ml-2 h-4 w-4" aria-hidden="true" />
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-xl"
                              onClick={() => setConversationMode("inspiration_unsplash")}
                            >
                              <IconComponent name="Image" className="mr-2 h-4 w-4" aria-hidden="true" />
                              Unsplash 图片
                              <span className="ml-auto text-xs text-muted-foreground">30s</span>
                              {conversationMode === "inspiration_unsplash" && (
                                <IconComponent name="Check" className="ml-2 h-4 w-4" aria-hidden="true" />
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-xl"
                              onClick={() => setConversationMode("inspiration_ad")}
                            >
                              <IconComponent name="Megaphone" className="mr-2 h-4 w-4" aria-hidden="true" />
                              广告视频灵感
                              <span className="ml-auto text-xs text-muted-foreground">30s</span>
                              {conversationMode === "inspiration_ad" && (
                                <IconComponent name="Check" className="ml-2 h-4 w-4" aria-hidden="true" />
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-xl"
                              onClick={() => setConversationMode("inspiration_stream")}
                            >
                              <IconComponent name="PlaySquare" className="mr-2 h-4 w-4" aria-hidden="true" />
                              流媒体视频
                              <span className="ml-auto text-xs text-muted-foreground">30s</span>
                              {conversationMode === "inspiration_stream" && (
                                <IconComponent name="Check" className="ml-2 h-4 w-4" aria-hidden="true" />
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          className="rounded-xl"
                          onClick={() => setConversationMode("chat")}
                        >
                          <IconComponent name="MessageCircle" className="mr-2 h-4 w-4" aria-hidden="true" />
                          对话模式
                          <span className="ml-auto text-xs text-muted-foreground">30s</span>
                          {conversationMode === "chat" && (
                            <IconComponent name="Check" className="ml-2 h-4 w-4" aria-hidden="true" />
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className="group h-9 gap-2 rounded-full border border-border bg-background px-3 hover:bg-muted"
                          title="选择模型"
                        >
                          <IconComponent name="Zap" className="h-4 w-4" aria-hidden="true" />
                          <span className="text-sm">{speedLabel(selectedModel)}</span>
                          <IconComponent
                            name="ChevronDown"
                            className={cn(
                              "h-4 w-4 opacity-70 transition-transform duration-200",
                              "group-data-[state=open]:rotate-180",
                            )}
                            aria-hidden="true"
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="top" align="start" className="min-w-[240px] rounded-2xl p-2">
                        <DropdownMenuItem
                          className="rounded-xl"
                          onClick={() => setSelectedModel("gemini-3-pro-preview")}
                        >
                          <IconComponent name="Brain" className="mr-2 h-4 w-4" aria-hidden="true" />
                          思考模式
                          <span className="ml-auto text-xs text-muted-foreground">Pro</span>
                          {selectedModel === "gemini-3-pro-preview" && (
                            <IconComponent name="Check" className="ml-2 h-4 w-4" aria-hidden="true" />
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="rounded-xl"
                          onClick={() => setSelectedModel("gemini-3-flash-preview")}
                        >
                          <IconComponent name="Zap" className="mr-2 h-4 w-4" aria-hidden="true" />
                          极速模式
                          {selectedModel === "gemini-3-flash-preview" && (
                            <IconComponent name="Check" className="ml-auto h-4 w-4" aria-hidden="true" />
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <Button
                    type="button"
                    size="icon"
                    className="h-10 w-10 rounded-full"
                    onClick={() => void send()}
                    disabled={isSending || (draft.trim().length === 0 && pendingFiles.length === 0)}
                    title="发送"
                  >
                    {isSending ? (
                      <IconComponent name="LoaderCircle" className="h-5 w-5 animate-spin" aria-hidden="true" />
                    ) : (
                      <IconComponent name="ArrowUp" className="h-5 w-5" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Intentionally no API key hint here (per product UI). */}
            </div>
          </DialogPrimitive.Content>
          </div>
        </DialogPrimitive.Portal>
      )}
    </DialogPrimitive.Root>
  );
}
