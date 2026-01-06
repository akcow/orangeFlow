// ERROR
export const MISSED_ERROR_ALERT = "提示：你似乎漏填了某些内容";
export const INCOMPLETE_LOOP_ERROR_ALERT =
  "流程中存在未闭合的循环，请检查连线后重试。";
export const INVALID_FILE_ALERT =
  "请选择有效文件，仅允许以下文件类型：";
export const CONSOLE_ERROR_MSG = "上传文件时发生错误";
export const CONSOLE_SUCCESS_MSG = "文件上传成功";
export const INFO_MISSING_ALERT =
  "提示：你似乎漏填了必填信息：";
export const FUNC_ERROR_ALERT = "你的函数存在错误";
export const IMPORT_ERROR_ALERT = "你的导入语句存在错误";
export const BUG_ALERT = "发生错误，请稍后重试";
export const CODE_ERROR_ALERT =
  "这段代码可能有问题，请检查后再试";
export const CHAT_ERROR_ALERT =
  "使用聊天前请先重新构建该流程。";
export const MSG_ERROR_ALERT = "发送消息失败";
export const PROMPT_ERROR_ALERT =
  "该提示词可能有问题，请检查后再试";
export const API_ERROR_ALERT =
  "保存 API Key 失败，请重试。";
export const USER_DEL_ERROR_ALERT = "删除用户失败";
export const USER_EDIT_ERROR_ALERT = "编辑用户失败";
export const USER_ADD_ERROR_ALERT = "新增用户失败";
export const SIGNIN_ERROR_ALERT = "登录失败";
export const DEL_KEY_ERROR_ALERT = "删除密钥失败";
export const DEL_KEY_ERROR_ALERT_PLURAL = "删除密钥失败";
export const UPLOAD_ERROR_ALERT = "上传文件失败";
export const WRONG_FILE_ERROR_ALERT = "文件类型无效";
export const UPLOAD_ALERT_LIST = "请上传 JSON 文件";
export const INVALID_SELECTION_ERROR_ALERT = "无效选择";
export const EDIT_PASSWORD_ERROR_ALERT = "修改密码失败";
export const EDIT_PASSWORD_ALERT_LIST = "两次输入的密码不一致";
export const SAVE_ERROR_ALERT = "保存更改失败";
export const PROFILE_PICTURES_GET_ERROR_ALERT =
  "获取头像失败";
export const SIGNUP_ERROR_ALERT = "注册失败";
export const APIKEY_ERROR_ALERT = "API Key 错误";
export const NOAPI_ERROR_ALERT =
  "你还没有 API Key，请先添加后再使用 Langflow Store。";
export const INVALID_API_ERROR_ALERT =
  "你的 API Key 无效，请添加有效的 API Key 后再使用 Langflow Store。";
export const COMPONENTS_ERROR_ALERT = "获取组件失败。";

// NOTICE
export const NOCHATOUTPUT_NOTICE_ALERT =
  "该流程中没有 ChatOutput 组件。";
export const API_WARNING_NOTICE_ALERT =
  "警告：JSON 文件可能包含 API Key 等敏感信息。";
export const COPIED_NOTICE_ALERT = "API Key 已复制！";
export const TEMP_NOTICE_ALERT = "该模板不包含任何变量。";

// SUCCESS
export const CODE_SUCCESS_ALERT = "代码已准备就绪，可以运行";
export const PROMPT_SUCCESS_ALERT = "提示词已准备就绪";
export const API_SUCCESS_ALERT = "API Key 保存成功。";
export const USER_DEL_SUCCESS_ALERT = "用户已删除。";
export const USER_EDIT_SUCCESS_ALERT = "用户已更新。";
export const USER_ADD_SUCCESS_ALERT = "已添加新用户。";
export const DEL_KEY_SUCCESS_ALERT = "密钥已删除。";
export const DEL_KEY_SUCCESS_ALERT_PLURAL = "密钥已删除。";
export const FLOW_BUILD_SUCCESS_ALERT = "流程构建成功";
export const SAVE_SUCCESS_ALERT = "更改已保存！";
export const INVALID_FILE_SIZE_ALERT = (maxSizeMB) => {
  return `文件过大，请选择小于 ${maxSizeMB} MB 的文件。`;
};
