// src/constants/constants.ts

import {
  BASE_URL_API as CUSTOM_BASE_URL_API,
  BASE_URL_API_V2 as CUSTOM_BASE_URL_API_V2,
} from "../customization/config-constants";
import { customDefaultShortcuts } from "../customization/constants";
import type { languageMap } from "../types/components";

const getEnvVar = (key: string, defaultValue: any = undefined) => {
  if (typeof process !== "undefined" && process.env) {
    return process.env[key] ?? defaultValue;
  }
  try {
    return new Function(`return import.meta.env?.${key}`)() ?? defaultValue;
  } catch {
    return defaultValue;
  }
};

/**
 * invalid characters for flow name
 * @constant
 */
export const INVALID_CHARACTERS = [
  " ",
  ",",
  ".",
  ":",
  ";",
  "!",
  "?",
  "/",
  "\\",
  "(",
  ")",
  "[",
  "]",
  "\n",
];

/**
 * regex to highlight the variables in the text
 * @constant regexHighlight
 * @type {RegExp}
 * @default
 * @example
 * {{variable}} or {variable}
 * @returns {RegExp}
 * @description
 * This regex is used to highlight the variables in the text.
 * It matches the variables in the text that are between {{}} or {}.
 */

/**
 *  p1 – fenced code block ```...```
 *  p2 – opening brace run (one or more)
 *  p3 – variable name  (no braces)
 *  p4 – closing brace run (one or more)
 */
export const regexHighlight = /(```[\s\S]*?```)|(\{+)([^{}]+)(\}+)/g;
export const specialCharsRegex = /[!@#$%^&*()\-_=+[\]{}|;:'",.<>/?\\`´]/;

export const programmingLanguages: languageMap = {
  javascript: ".js",
  python: ".py",
  java: ".java",
  c: ".c",
  cpp: ".cpp",
  "c++": ".cpp",
  "c#": ".cs",
  ruby: ".rb",
  php: ".php",
  swift: ".swift",
  "objective-c": ".m",
  kotlin: ".kt",
  typescript: ".ts",
  go: ".go",
  perl: ".pl",
  rust: ".rs",
  scala: ".scala",
  haskell: ".hs",
  lua: ".lua",
  shell: ".sh",
  sql: ".sql",
  html: ".html",
  css: ".css",
  // add more file extensions here, make sure the key is same as language prop in CodeBlock.tsx component
};
/**
 * Number maximum of components to scroll on tooltips
 * @constant
 */
export const MAX_LENGTH_TO_SCROLL_TOOLTIP = 200;

export const MESSAGES_TABLE_ORDER = [
  "timestamp",
  "message",
  "text",
  "sender",
  "sender_name",
  "session_id",
  "files",
];

/**
 * Number maximum of components to scroll on tooltips
 * @constant
 */
export const MAX_WORDS_HIGHLIGHT = 79;

/**
 * Limit of items before show scroll on fields modal
 * @constant
 */
export const limitScrollFieldsModal = 10;

/**
 * The base text for subtitle of Export Dialog (Toolbar)
 * @constant
 */
export const EXPORT_DIALOG_SUBTITLE = "将流程导出为 JSON 文件。";
/**
 * The base text for subtitle of Flow Settings (Menubar)
 * @constant
 */
export const SETTINGS_DIALOG_SUBTITLE =
  "Customize your flow details and settings.";

/**
 * The base text for subtitle of Flow Logs (Menubar)
 * @constant
 */
export const LOGS_DIALOG_SUBTITLE =
  "Explore detailed logs of events and transactions between components.";

/**
 * The base text for subtitle of Code Dialog (Toolbar)
 * @constant
 */
export const CODE_DIALOG_SUBTITLE =
  "Export your flow to integrate it using this code.";

/**
 * The base text for subtitle of Chat Form
 * @constant
 */
export const CHAT_FORM_DIALOG_SUBTITLE =
  "Interact with your AI. Monitor inputs, outputs and memories.";

/**
 * The base text for subtitle of Edit Node Dialog
 * @constant
 */
export const EDIT_DIALOG_SUBTITLE =
  "Adjust component's settings and define parameter visibility. Remember to save your changes.";

/**
 * The base text for subtitle of Code Dialog
 * @constant
 */
export const CODE_PROMPT_DIALOG_SUBTITLE =
  "编辑你的 Python 代码片段。参考 Langflow 文档以了解如何编写自定义组件。";

export const CODE_DICT_DIALOG_SUBTITLE =
  "自定义你的字典：按需添加或编辑键值对。支持新增对象 {} 或数组 []。";

/**
 * The base text for subtitle of Prompt Dialog
 * @constant
 */
export const PROMPT_DIALOG_SUBTITLE =
  "创建你的提示词。提示词可用于引导大模型行为；使用花括号 {} 引入变量。";

export const CHAT_CANNOT_OPEN_TITLE = "无法打开聊天";

export const CHAT_CANNOT_OPEN_DESCRIPTION = "该流程不是聊天流程。";

export const FLOW_NOT_BUILT_TITLE = "流程尚未构建";

export const FLOW_NOT_BUILT_DESCRIPTION =
  "请先构建流程，再开始聊天。";

/**
 * The base text for subtitle of Text Dialog
 * @constant
 */
export const TEXT_DIALOG_TITLE = "编辑文本内容";

/**
 * The base text for subtitle of Import Dialog
 * @constant
 */
export const IMPORT_DIALOG_SUBTITLE =
  "从 JSON 文件导入流程，或从已有示例中选择。";

/**
 * The text that shows when a tooltip is empty
 * @constant
 */
export const TOOLTIP_EMPTY = "未找到兼容的组件。";

export const CSVViewErrorTitle = "CSV 输出";

export const CSVNoDataError = "暂无数据";

export const PDFViewConstant = "展开输出以查看 PDF";

export const CSVError = "加载 CSV 失败";

export const PDFLoadErrorTitle = "加载 PDF 失败";

export const PDFCheckFlow = "请检查你的流程并重试";

export const PDFErrorTitle = "PDF 输出";

export const PDFLoadError = "运行流程以查看 PDF";

export const IMGViewConstant = "展开视图以查看图片";

export const IMGViewErrorMSG =
  "运行流程或提供一个有效的 URL 以查看图片";

export const IMGViewErrorTitle = "图片输出";

/**
 * The base text for subtitle of code dialog
 * @constant
 */
export const EXPORT_CODE_DIALOG =
  "Generate the code to integrate your flow into an external application.";

/**
 * The base text for subtitle of code dialog
 * @constant
 */
export const COLUMN_DIV_STYLE =
  " w-full h-full flex overflow-auto flex-col bg-muted px-16 ";

export const NAV_DISPLAY_STYLE =
  " w-full flex justify-between py-12 pb-2 px-6 ";

/**
 * The base text for subtitle of code dialog
 * @constant
 */
export const DESCRIPTIONS: string[] = [
  "Chain the Words, Master Language!",
  "Language Architect at Work!",
  "Empowering Language Engineering.",
  "Craft Language Connections Here.",
  "Create, Connect, Converse.",
  "Smart Chains, Smarter Conversations.",
  "Bridging Prompts for Brilliance.",
  "Language Models, Unleashed.",
  "Your Hub for Text Generation.",
  "Promptly Ingenious!",
  "Building Linguistic Labyrinths.",
  "Langflow: Create, Chain, Communicate.",
  "Connect the Dots, Craft Language.",
  "Interactive Language Weaving.",
  "Generate, Innovate, Communicate.",
  "Conversation Catalyst Engine.",
  "Language Chainlink Master.",
  "Design Dialogues with Langflow.",
  "Nurture NLP Nodes Here.",
  "Conversational Cartography Unlocked.",
  "Design, Develop, Dialogize.",
];
export const BUTTON_DIV_STYLE =
  " flex gap-2 focus:ring-1 focus:ring-offset-1 focus:ring-ring focus:outline-none ";

/**
 * The base text for subtitle of code dialog
 * @constant
 */
export const ADJECTIVES: string[] = [
  "admiring",
  "adoring",
  "agitated",
  "amazing",
  "angry",
  "awesome",
  "backstabbing",
  "berserk",
  "big",
  "boring",
  "clever",
  "cocky",
  "compassionate",
  "condescending",
  "cranky",
  "desperate",
  "determined",
  "distracted",
  "dreamy",
  "drunk",
  "ecstatic",
  "elated",
  "elegant",
  "evil",
  "fervent",
  "focused",
  "furious",
  "gigantic",
  "gloomy",
  "goofy",
  "grave",
  "happy",
  "high",
  "hopeful",
  "hungry",
  "insane",
  "jolly",
  "jovial",
  "kickass",
  "lonely",
  "loving",
  "mad",
  "modest",
  "naughty",
  "nauseous",
  "nostalgic",
  "pedantic",
  "pensive",
  "prickly",
  "reverent",
  "romantic",
  "sad",
  "serene",
  "sharp",
  "sick",
  "silly",
  "sleepy",
  "small",
  "stoic",
  "stupefied",
  "suspicious",
  "tender",
  "thirsty",
  "tiny",
  "trusting",
  "bubbly",
  "charming",
  "cheerful",
  "comical",
  "dazzling",
  "delighted",
  "dynamic",
  "effervescent",
  "enthusiastic",
  "exuberant",
  "fluffy",
  "friendly",
  "funky",
  "giddy",
  "giggly",
  "gleeful",
  "goofy",
  "graceful",
  "grinning",
  "hilarious",
  "inquisitive",
  "joyous",
  "jubilant",
  "lively",
  "mirthful",
  "mischievous",
  "optimistic",
  "peppy",
  "perky",
  "playful",
  "quirky",
  "radiant",
  "sassy",
  "silly",
  "spirited",
  "sprightly",
  "twinkly",
  "upbeat",
  "vibrant",
  "witty",
  "zany",
  "zealous",
];
/**
 * Nouns for the name of the flow
 * @constant
 *
 */
export const NOUNS: string[] = [
  "albattani",
  "allen",
  "almeida",
  "archimedes",
  "ardinghelli",
  "aryabhata",
  "austin",
  "babbage",
  "banach",
  "bardeen",
  "bartik",
  "bassi",
  "bell",
  "bhabha",
  "bhaskara",
  "blackwell",
  "bohr",
  "booth",
  "borg",
  "bose",
  "boyd",
  "brahmagupta",
  "brattain",
  "brown",
  "carson",
  "chandrasekhar",
  "colden",
  "cori",
  "cray",
  "curie",
  "darwin",
  "davinci",
  "dijkstra",
  "dubinsky",
  "easley",
  "einstein",
  "elion",
  "engelbart",
  "euclid",
  "euler",
  "fermat",
  "fermi",
  "feynman",
  "franklin",
  "galileo",
  "gates",
  "goldberg",
  "goldstine",
  "goldwasser",
  "golick",
  "goodall",
  "hamilton",
  "hawking",
  "heisenberg",
  "heyrovsky",
  "hodgkin",
  "hoover",
  "hopper",
  "hugle",
  "hypatia",
  "jang",
  "jennings",
  "jepsen",
  "joliot",
  "jones",
  "kalam",
  "kare",
  "keller",
  "khorana",
  "kilby",
  "kirch",
  "knuth",
  "kowalevski",
  "lalande",
  "lamarr",
  "leakey",
  "leavitt",
  "lichterman",
  "liskov",
  "lovelace",
  "lumiere",
  "mahavira",
  "mayer",
  "mccarthy",
  "mcclintock",
  "mclean",
  "mcnulty",
  "meitner",
  "meninsky",
  "mestorf",
  "minsky",
  "mirzakhani",
  "morse",
  "murdock",
  "newton",
  "nobel",
  "noether",
  "northcutt",
  "noyce",
  "panini",
  "pare",
  "pasteur",
  "payne",
  "perlman",
  "pike",
  "poincare",
  "poitras",
  "ptolemy",
  "raman",
  "ramanujan",
  "ride",
  "ritchie",
  "roentgen",
  "rosalind",
  "saha",
  "sammet",
  "shaw",
  "shirley",
  "shockley",
  "sinoussi",
  "snyder",
  "spence",
  "stallman",
  "stonebraker",
  "swanson",
  "swartz",
  "swirles",
  "tesla",
  "thompson",
  "torvalds",
  "turing",
  "varahamihira",
  "visvesvaraya",
  "volhard",
  "wescoff",
  "williams",
  "wilson",
  "wing",
  "wozniak",
  "wright",
  "yalow",
  "yonath",
  "coulomb",
  "degrasse",
  "dewey",
  "edison",
  "eratosthenes",
  "faraday",
  "galton",
  "gauss",
  "herschel",
  "hubble",
  "joule",
  "kaku",
  "kepler",
  "khayyam",
  "lavoisier",
  "maxwell",
  "mendel",
  "mendeleev",
  "ohm",
  "pascal",
  "planck",
  "riemann",
  "schrodinger",
  "sagan",
  "tesla",
  "tyson",
  "volta",
  "watt",
  "weber",
  "wien",
  "zoBell",
  "zuse",
];

/**
 * Header text for user projects
 * @constant
 *
 */
export const USER_PROJECTS_HEADER = "我的收藏";

// This will be dynamically set based on the RUN_WITH_OPENRAG feature flag
// The actual value is determined by the backend configuration
export const DEFAULT_FOLDER = "入门项目";
export const OPENRAG_FOLDER = "OpenRAG";

export const MAX_MCP_SERVER_NAME_LENGTH = 30;

/**
 * Header text for admin page
 * @constant
 *
 */
export const ADMIN_HEADER_TITLE = "管理后台";

/**
 * Header description for admin page
 * @constant
 *
 */
export const ADMIN_HEADER_DESCRIPTION =
  "在这里可以统一管理应用内的所有用户账号。";

export const BASE_URL_API = CUSTOM_BASE_URL_API || "/api/v1/";

export const BASE_URL_API_V2 = CUSTOM_BASE_URL_API_V2 || "/api/v2/";

/**
 * URLs excluded from error retries.
 * @constant
 *
 */
export const URL_EXCLUDED_FROM_ERROR_RETRIES = [
  `${BASE_URL_API}validate/code`,
  `${BASE_URL_API}custom_component`,
  `${BASE_URL_API}validate/prompt`,
  `${BASE_URL_API}/login`,
  `${BASE_URL_API}api_key/store`,
];

export const skipNodeUpdate = [
  "CustomComponent",
  "PromptTemplate",
  "ChatMessagePromptTemplate",
  "SystemMessagePromptTemplate",
  "HumanMessagePromptTemplate",
];

export const CONTROL_INPUT_STATE = {
  password: "",
  cnfPassword: "",
  username: "",
};

export const CONTROL_PATCH_USER_STATE = {
  password: "",
  cnfPassword: "",
  profilePicture: "",
  apikey: "",
};

export const CONTROL_LOGIN_STATE = {
  username: "",
  password: "",
};

export const CONTROL_NEW_USER = {
  username: "",
  password: "",
  is_active: false,
  is_superuser: false,
};

export const tabsCode = [];

export const FETCH_ERROR_MESSAGE = "无法建立连接。";
export const FETCH_ERROR_DESCRIPION =
  "请检查服务是否正常运行，然后重试。";

export const TIMEOUT_ERROR_MESSAGE =
  "服务器正在处理你的请求，请稍等片刻。";
export const TIMEOUT_ERROR_DESCRIPION = "服务器繁忙。";

export const SIGN_UP_SUCCESS = "账号已创建！请等待管理员激活。";

export const API_PAGE_PARAGRAPH =
  "你的 Langflow API Key 列表如下。请勿与他人分享，也不要在浏览器或其他客户端代码中暴露。";

export const API_PAGE_USER_KEYS =
  "该用户当前没有分配任何密钥。";

export const LAST_USED_SPAN_1 = "该密钥的最近使用时间。";

export const LAST_USED_SPAN_2 =
  "精确到最近一次使用的小时级别。";

export const LANGFLOW_SUPPORTED_TYPES = new Set([
  "str",
  "bool",
  "float",
  "code",
  "prompt",
  "file",
  "int",
  "dict",
  "NestedDict",
  "table",
  "link",
  "slider",
  "tab",
  "sortableList",
  "connect",
  "auth",
  "query",
  "mcp",
  "tools",
]);

export const FLEX_VIEW_TYPES = ["bool"];

export const priorityFields = new Set(["code", "template", "mode"]);

export const INPUT_TYPES = new Set([
  "ChatInput",
  // "TextInput",
  // "KeyPairInput",
  // "JsonInput",
  // "StringListInput",
]);
export const OUTPUT_TYPES = new Set([
  "ChatOutput",
  // "TextOutput",
  // "PDFOutput",
  // "ImageOutput",
  // "CSVOutput",
  // "JsonOutput",
  // "KeyPairOutput",
  // "StringListOutput",
  // "DataOutput",
  // "TableOutput",
]);

export const CHAT_FIRST_INITIAL_TEXT =
  "开始对话并点击智能体的记忆";

export const TOOLTIP_OUTDATED_NODE =
  "该组件已过期，点击更新（可能会丢失数据）";

export const CHAT_SECOND_INITIAL_TEXT = "用于查看历史消息。";

export const TOOLTIP_OPEN_HIDDEN_OUTPUTS = "展开隐藏输出";
export const TOOLTIP_HIDDEN_OUTPUTS = "收起隐藏输出";

export const ZERO_NOTIFICATIONS = "暂无新通知";

export const SUCCESS_BUILD = "构建成功";

export const ALERT_SAVE_WITH_API =
  "注意：取消勾选只会移除专门标记为 API Key 的字段中的密钥。";

export const SAVE_WITH_API_CHECKBOX = "导出时包含我的 API Key";
export const EDIT_TEXT_MODAL_TITLE = "编辑文本";
export const EDIT_TEXT_PLACEHOLDER = "在此输入消息。";
export const INPUT_HANDLER_HOVER = "可用输入组件：";
export const OUTPUT_HANDLER_HOVER = "可用输出组件：";
export const TEXT_INPUT_MODAL_TITLE = "输入";
export const OUTPUTS_MODAL_TITLE = "输出";
export const LANGFLOW_CHAT_TITLE = "Langflow 聊天";
export const CHAT_INPUT_PLACEHOLDER =
  "未找到聊天输入变量。点击运行你的流程。";
export const CHAT_INPUT_PLACEHOLDER_SEND = "发送消息…";
export const EDIT_CODE_TITLE = "编辑代码";
export const MY_COLLECTION_DESC =
  "管理你的项目：下载或上传整个合集。";
export const STORE_DESC = "浏览社区分享的流程与组件。";
export const STORE_TITLE = "Langflow 商店";
export const NO_API_KEY = "你还没有 API Key。";
export const INSERT_API_KEY = "请输入你的 Langflow API Key。";
export const INVALID_API_KEY = "你的 API Key 无效。";
export const CREATE_API_KEY = "还没有 API Key？前往注册：";
export const STATUS_BUILD = "构建以验证状态。";
export const STATUS_MISSING_FIELDS_ERROR =
  "请填写所有必填字段。";
export const STATUS_INACTIVE = "执行已阻止";
export const STATUS_BUILDING = "构建中…";
export const SAVED_HOVER = "上次保存：";
export const RUN_TIMESTAMP_PREFIX = "上次运行：";

export const PRIORITY_SIDEBAR_ORDER = [
  "saved_components",
  "inputs",
  "outputs",
  "prompts",
  "data",
  "prompt",
  "models",
  "helpers",
  "vectorstores",
  "embeddings",
];

export const BUNDLES_SIDEBAR_FOLDER_NAMES = [
  "notion",
  "Notion",
  "AssemblyAI",
  "assemblyai",
  "LangWatch",
  "langwatch",
  "YouTube",
  "youtube",
  "pinecone",
  "weaviate",
  "qdrant",
  "mongodb",
  "elastic",
  "supabase",
  "milvus",
  "chroma",
  "clickhouse",
  "couchbase",
  "upstash",
  "vectara",
  "cassandra",
  "FAISS",
  "pgvector",
];

export const AUTHORIZED_DUPLICATE_REQUESTS = [
  "/health",
  "/flows",
  "/logout",
  "/refresh",
  "/login",
  "/auto_login",
];

export const BROKEN_EDGES_WARNING =
  "由于连接无效，已移除部分连接：";

export const SAVE_DEBOUNCE_TIME = 300;

export const IS_MAC =
  typeof navigator !== "undefined" &&
  navigator.userAgent.toUpperCase().includes("MAC");

export const defaultShortcuts = customDefaultShortcuts;

export const DEFAULT_TABLE_ALERT_MSG = "暂无可显示的数据，请稍后再试。";

export const DEFAULT_TABLE_ALERT_TITLE = "暂无数据";

export const NO_COLUMN_DEFINITION_ALERT_TITLE = "缺少列定义";

export const NO_COLUMN_DEFINITION_ALERT_DESCRIPTION =
  "该表格没有可用的列定义。";

export const LOCATIONS_TO_RETURN = ["/flow/", "/settings/"];

export const MAX_BATCH_SIZE = 50;

export const MODAL_CLASSES =
  "nopan nodelete nodrag  noflow fixed inset-0 bottom-0 left-0 right-0 top-0 z-50 overflow-auto bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

export const ALLOWED_IMAGE_INPUT_EXTENSIONS = ["png", "jpg", "jpeg"];

export const componentsToIgnoreUpdate = ["CustomComponent"];

export const FS_ERROR_TEXT =
  "请确保你的文件扩展名为以下之一：";
export const SN_ERROR_TEXT = ALLOWED_IMAGE_INPUT_EXTENSIONS.join(", ");

export const ERROR_UPDATING_COMPONENT =
  "更新组件时发生意外错误，请重试。";
export const TITLE_ERROR_UPDATING_COMPONENT =
  "更新组件失败";

export const EMPTY_INPUT_SEND_MESSAGE = "未提供输入消息。";

export const EMPTY_OUTPUT_SEND_MESSAGE = "消息为空。";

export const TABS_ORDER = [
  "curl",
  "python api",
  "js api",
  "python code",
  "chat widget html",
];

export const LANGFLOW_ACCESS_TOKEN = "access_token_lf";
export const LANGFLOW_API_TOKEN = "apikey_tkn_lflw";
export const LANGFLOW_AUTO_LOGIN_OPTION = "auto_login_lf";
export const LANGFLOW_REFRESH_TOKEN = "refresh_token_lf";

export const LANGFLOW_ACCESS_TOKEN_EXPIRE_SECONDS = 60 * 60 - 60 * 60 * 0.1;
export const LANGFLOW_ACCESS_TOKEN_EXPIRE_SECONDS_ENV =
  Number(getEnvVar("ACCESS_TOKEN_EXPIRE_SECONDS", 60)) -
  Number(getEnvVar("ACCESS_TOKEN_EXPIRE_SECONDS", 60)) * 0.1;
export const TEXT_FIELD_TYPES: string[] = ["str", "SecretStr"];
export const NODE_WIDTH = 384;
export const NODE_HEIGHT = NODE_WIDTH * 3;

export const SHORTCUT_KEYS = ["cmd", "ctrl", "mod", "alt", "shift"];

export const SERVER_HEALTH_INTERVAL = 10000;
export const REFETCH_SERVER_HEALTH_INTERVAL = 20000;
export const DRAG_EVENTS_CUSTOM_TYPESS = {
  genericnode: "genericNode",
  notenode: "noteNode",
  "text/plain": "text/plain",
};

export const NOTE_NODE_MIN_WIDTH = 324;
export const NOTE_NODE_MIN_HEIGHT = 324;
export const NOTE_NODE_MAX_HEIGHT = 800;
export const NOTE_NODE_MAX_WIDTH = 1000;

export const COLOR_OPTIONS = {
  amber: "hsl(var(--note-amber))",
  neutral: "hsl(var(--note-neutral))",
  rose: "hsl(var(--note-rose))",
  blue: "hsl(var(--note-blue))",
  lime: "hsl(var(--note-lime))",
  transparent: null,
};

// Palette for group container backgrounds.
// Use datatype colors because they are already tuned for both light/dark themes.
// Store only the CSS variable name (without `var(...)`) so callers can decide alpha.
export const GROUP_COLOR_OPTIONS: Record<string, string> = {
  cyan: "--datatype-cyan",
  blue: "--datatype-blue",
  indigo: "--datatype-indigo",
  violet: "--datatype-violet",
  fuchsia: "--datatype-fuchsia",
  rose: "--datatype-rose",
  pink: "--datatype-pink",
  orange: "--datatype-orange",
  yellow: "--datatype-yellow",
  lime: "--datatype-lime",
  emerald: "--datatype-emerald",
  red: "--datatype-red",
};

export const maxSizeFilesInBytes = 10 * 1024 * 1024; // 10MB in bytes
export const MAX_TEXT_LENGTH = 99999;

export const SEARCH_TABS = ["All", "Flows", "Components"];
export const PAGINATION_SIZE = 12;
export const PAGINATION_PAGE = 1;

export const STORE_PAGINATION_SIZE = 12;
export const STORE_PAGINATION_PAGE = 1;

export const PAGINATION_ROWS_COUNT = [12, 24, 48, 96];
export const STORE_PAGINATION_ROWS_COUNT = [12, 24, 48, 96];

export const GRADIENT_CLASS =
  "linear-gradient(to right, hsl(var(--background) / 0.3), hsl(var(--background)))";

export const GRADIENT_CLASS_DISABLED =
  "linear-gradient(to right, hsl(var(--muted) / 0.3), hsl(var(--muted)))";

export const RECEIVING_INPUT_VALUE = "正在接收输入";
export const SELECT_AN_OPTION = "请选择一个选项";

export const ICON_STROKE_WIDTH = 1.5;

export const DEFAULT_PLACEHOLDER = "请输入…";

export const DEFAULT_TOOLSET_PLACEHOLDER = "作为工具使用";

export const SAVE_API_KEY_ALERT = "API Key 保存成功";
export const POLLING_MESSAGES = {
  ENDPOINT_NOT_AVAILABLE: "端点不可用",
  STREAMING_NOT_SUPPORTED: "不支持流式输出",
} as const;

export const BUILD_POLLING_INTERVAL = 25;

export const IS_AUTO_LOGIN =
  !getEnvVar("LANGFLOW_AUTO_LOGIN") ||
  String(getEnvVar("LANGFLOW_AUTO_LOGIN"))?.toLowerCase() !== "false";

export const AUTO_LOGIN_RETRY_DELAY = 2000;
export const AUTO_LOGIN_MAX_RETRY_DELAY = 60000;

export const ALL_LANGUAGES = [
  { value: "zh-CN", name: "简体中文" },
];

export const DEBOUNCE_FIELD_LIST = [
  "SecretStrInput",
  "MessageTextInput",
  "TextInput",
  "MultilineInput",
  "SecretStrInput",
  "IntInput",
  "FloatInput",
  "SliderInput",
];

export const OPENAI_VOICES = [
  { name: "alloy", value: "alloy" },
  { name: "ash", value: "ash" },
  { name: "ballad", value: "ballad" },
  { name: "coral", value: "coral" },
  { name: "echo", value: "echo" },
  { name: "sage", value: "sage" },
  { name: "shimmer", value: "shimmer" },
  { name: "verse", value: "verse" },
];

export const DEFAULT_POLLING_INTERVAL = 5000;
export const DEFAULT_TIMEOUT = 30000;
export const DEFAULT_FILE_PICKER_TIMEOUT = 60000;
export const DISCORD_URL = "https://discord.com/invite/EqksyE2EX9";
export const GITHUB_URL = "https://github.com/langflow-ai/langflow";
export const TWITTER_URL = "https://x.com/langflow_ai";
export const DOCS_URL = "https://docs.langflow.org";
export const DATASTAX_DOCS_URL =
  "https://docs.datastax.com/en/langflow/index.html";
export const BUG_REPORT_URL = "https://github.com/langflow-ai/langflow/issues";

export const UUID_PARSING_ERROR = "uuid_parsing";
