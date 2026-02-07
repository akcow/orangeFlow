import { create } from "zustand";

export type CanvasAssistantRole = "user" | "assistant";

export type CanvasAssistantConversationMode =
  | "chat"
  | "storyboard"
  | "moodboard"
  | "inspiration_film"
  | "inspiration_mj"
  | "inspiration_unsplash"
  | "inspiration_ad"
  | "inspiration_stream";

export type CanvasAssistantAttachmentMeta = {
  name: string;
  mimeType: string;
  size: number;
};

export type CanvasAssistantMessage = {
  id: string;
  role: CanvasAssistantRole;
  content: string;
  // The conversation mode at the time this message was generated/sent.
  // Used by the UI to render mode-specific cards (e.g. storyboard).
  mode?: CanvasAssistantConversationMode;
  createdAt: number;
  attachments?: CanvasAssistantAttachmentMeta[];
};

export type CanvasAssistantSession = {
  id: string;
  createdAt: number;
  messages: CanvasAssistantMessage[];
  // A short topic-like title generated from the conversation.
  title?: string;
  titleStatus?: "idle" | "generating" | "done" | "error";
};

type CanvasAssistantStore = {
  open: boolean;
  setOpen: (open: boolean) => void;

  drawerWidth: number;
  setDrawerWidth: (width: number) => void;

  activeFlowId: string | null;
  setActiveFlowId: (flowId: string | null) => void;

  selectedModel: "gemini-3-pro-preview" | "gemini-3-flash-preview";
  setSelectedModel: (
    model: "gemini-3-pro-preview" | "gemini-3-flash-preview",
  ) => void;

  // Affects the model call via system prompt injection (e.g. storyboard planning).
  conversationMode: CanvasAssistantConversationMode;
  setConversationMode: (mode: CanvasAssistantConversationMode) => void;

  // Switch between the normal chat view and a read-only history view (same messages).
  viewMode: "chat" | "history";
  setViewMode: (mode: "chat" | "history") => void;

  // Trigger the drawer to open the native file picker (used by the floating grid+ button).
  filePickerRequestId: number;
  requestFilePicker: () => void;

  pendingAttachmentsByFlowId: Record<string, File[]>;
  addPendingAttachments: (flowId: string, files: File[]) => void;
  removePendingAttachment: (flowId: string, index: number) => void;
  clearPendingAttachments: (flowId: string) => void;

  autoRun: boolean;
  setAutoRun: (autoRun: boolean) => void;

  sessionsByFlowId: Record<string, CanvasAssistantSession[]>;
  activeSessionIdByFlowId: Record<string, string>;
  ensureSession: (flowId: string) => void;
  startNewSession: (flowId: string) => void;
  switchSession: (flowId: string, sessionId: string) => void;
  appendMessage: (flowId: string, message: CanvasAssistantMessage) => void;
  setSessionTitle: (flowId: string, sessionId: string, title: string) => void;
  setSessionTitleStatus: (
    flowId: string,
    sessionId: string,
    status: CanvasAssistantSession["titleStatus"],
  ) => void;
  clearHistory: (flowId: string) => void;

  insertCountByFlowId: Record<string, number>;
  nextInsertOffsetIndex: (flowId: string) => number;

  // Storyboard -> image generation settings (used by Canvas Assistant storyboard card).
  storyboardImageModel: string | null;
  setStoryboardImageModel: (model: string | null) => void;
};

const MAX_MESSAGES_PER_FLOW = 100;

export const useCanvasAssistantStore = create<CanvasAssistantStore>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),

  drawerWidth: 480,
  setDrawerWidth: (drawerWidth) => set({ drawerWidth }),

  activeFlowId: null,
  setActiveFlowId: (flowId) => set({ activeFlowId: flowId }),

  selectedModel: "gemini-3-pro-preview",
  setSelectedModel: (model) => set({ selectedModel: model }),

  conversationMode: "chat",
  setConversationMode: (conversationMode) => set({ conversationMode }),

  viewMode: "chat",
  setViewMode: (viewMode) => set({ viewMode }),

  filePickerRequestId: 0,
  requestFilePicker: () =>
    set((state) => ({ filePickerRequestId: state.filePickerRequestId + 1 })),

  pendingAttachmentsByFlowId: {},
  addPendingAttachments: (flowId, files) =>
    set((state) => {
      const prev = state.pendingAttachmentsByFlowId[flowId] ?? [];
      // Keep order stable; cap to avoid extreme payloads.
      const next = prev.concat(files).slice(0, 10);
      return {
        pendingAttachmentsByFlowId: {
          ...state.pendingAttachmentsByFlowId,
          [flowId]: next,
        },
      };
    }),
  removePendingAttachment: (flowId, index) =>
    set((state) => {
      const prev = state.pendingAttachmentsByFlowId[flowId] ?? [];
      const next = prev.filter((_, i) => i !== index);
      return {
        pendingAttachmentsByFlowId: {
          ...state.pendingAttachmentsByFlowId,
          [flowId]: next,
        },
      };
    }),
  clearPendingAttachments: (flowId) =>
    set((state) => ({
      pendingAttachmentsByFlowId: {
        ...state.pendingAttachmentsByFlowId,
        [flowId]: [],
      },
    })),

  autoRun: true,
  setAutoRun: (autoRun) => set({ autoRun }),

  sessionsByFlowId: {},
  activeSessionIdByFlowId: {},

  ensureSession: (flowId) => {
    if (!flowId) return;
    const sessions = get().sessionsByFlowId[flowId] ?? [];
    const activeId = get().activeSessionIdByFlowId[flowId] ?? null;
    if (sessions.length > 0 && activeId) return;
    const sessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const newSession: CanvasAssistantSession = {
      id: sessionId,
      createdAt: Date.now(),
      messages: [],
      titleStatus: "idle",
    };
    set((state) => ({
      sessionsByFlowId: {
        ...state.sessionsByFlowId,
        [flowId]: sessions.length > 0 ? sessions : [newSession],
      },
      activeSessionIdByFlowId: {
        ...state.activeSessionIdByFlowId,
        [flowId]: activeId ?? (sessions[0]?.id ?? sessionId),
      },
    }));
  },

  startNewSession: (flowId) => {
    if (!flowId) return;
    const sessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const newSession: CanvasAssistantSession = {
      id: sessionId,
      createdAt: Date.now(),
      messages: [],
      titleStatus: "idle",
    };
    set((state) => {
      const prev = state.sessionsByFlowId[flowId] ?? [];
      const next = [newSession, ...prev].slice(0, 30);
      return {
        sessionsByFlowId: { ...state.sessionsByFlowId, [flowId]: next },
        activeSessionIdByFlowId: { ...state.activeSessionIdByFlowId, [flowId]: sessionId },
      };
    });
  },

  switchSession: (flowId, sessionId) => {
    if (!flowId || !sessionId) return;
    set((state) => ({
      activeSessionIdByFlowId: { ...state.activeSessionIdByFlowId, [flowId]: sessionId },
    }));
  },

  appendMessage: (flowId, message) =>
    set((state) => {
      const sessions = state.sessionsByFlowId[flowId] ?? [];
      const activeId = state.activeSessionIdByFlowId[flowId] ?? sessions[0]?.id ?? null;
      if (!activeId) {
        const sessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const newSession: CanvasAssistantSession = {
          id: sessionId,
          createdAt: Date.now(),
          messages: [message].slice(-MAX_MESSAGES_PER_FLOW),
          titleStatus: "idle",
        };
        return {
          sessionsByFlowId: { ...state.sessionsByFlowId, [flowId]: [newSession] },
          activeSessionIdByFlowId: { ...state.activeSessionIdByFlowId, [flowId]: sessionId },
        };
      }

      const nextSessions = sessions.map((s) => {
        if (s.id !== activeId) return s;
        const nextMessages = (s.messages ?? []).concat(message).slice(-MAX_MESSAGES_PER_FLOW);
        return { ...s, messages: nextMessages };
      });
      return { sessionsByFlowId: { ...state.sessionsByFlowId, [flowId]: nextSessions } };
    }),

  setSessionTitle: (flowId, sessionId, title) =>
    set((state) => {
      const sessions = state.sessionsByFlowId[flowId] ?? [];
      const nextSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s;
        return { ...s, title, titleStatus: "done" as const };
      });
      return {
        sessionsByFlowId: { ...state.sessionsByFlowId, [flowId]: nextSessions },
      };
    }),

  setSessionTitleStatus: (flowId, sessionId, titleStatus) =>
    set((state) => {
      const sessions = state.sessionsByFlowId[flowId] ?? [];
      const nextSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s;
        return { ...s, titleStatus };
      });
      return {
        sessionsByFlowId: { ...state.sessionsByFlowId, [flowId]: nextSessions },
      };
    }),

  clearHistory: (flowId) =>
    set((state) => {
      const sessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const newSession: CanvasAssistantSession = {
        id: sessionId,
        createdAt: Date.now(),
        messages: [],
        titleStatus: "idle",
      };
      return {
        sessionsByFlowId: { ...state.sessionsByFlowId, [flowId]: [newSession] },
        activeSessionIdByFlowId: { ...state.activeSessionIdByFlowId, [flowId]: sessionId },
      };
    }),

  insertCountByFlowId: {},
  nextInsertOffsetIndex: (flowId) => {
    const current = get().insertCountByFlowId[flowId] ?? 0;
    const next = current + 1;
    set((state) => ({
      insertCountByFlowId: { ...state.insertCountByFlowId, [flowId]: next },
    }));
    return current;
  },

  storyboardImageModel: null,
  setStoryboardImageModel: (storyboardImageModel) => set({ storyboardImageModel }),
}));
