# DeepSeek API 调用文档

DeepSeek API 兼容 OpenAI API 格式，可使用 OpenAI SDK 或任何兼容 OpenAI API 的软件访问。以下是完整的 API 调用指南，包含认证方式、接口说明、参数详情、响应格式、示例代码和错误处理等内容。

---

## 一、准备工作

### 1.1 获取 API 密钥
1. 访问 [DeepSeek 开放平台](https://platform.deepseek.com/) 注册账号
2. 登录后在个人中心创建 API 密钥
3. 妥善保管密钥，避免泄露

### 1.2 环境要求
- 支持 HTTPS 的网络环境
- 请求 Content-Type: `application/json`
- 认证方式: Bearer Token 认证

---

## 二、基础信息

### 2.1 基础 URL
```
https://api.deepseek.com
```
兼容 OpenAI 格式，也可使用:
```
https://api.deepseek.com/v1
```
注意: `v1` 与模型版本无关，仅为兼容目的

### 2.2 认证方式
所有请求必须在请求头中包含:
```
Authorization: Bearer ${DEEPSEEK_API_KEY}
```
其中 `${DEEPSEEK_API_KEY}` 替换为你的 API 密钥

### 2.3 支持的模型
| 模型 ID | 描述 | 上下文长度 | 最大输出 | 特殊功能 |
|---------|------|------------|----------|----------|
| `deepseek-chat` | DeepSeek-V3.2 非思考模式 | 128K | 8192 | JSON 输出、Function Calling |
| `deepseek-reasoner` | DeepSeek-V3.2 思考模式 | 128K | 8192 | 推理内容、多轮思考+工具调用 |

---

## 三、核心接口

### 3.1 聊天补全接口 (Chat Completions)
用于生成对话式响应，支持多轮对话和上下文管理

#### 接口地址
```
POST /chat/completions
POST /v1/chat/completions (兼容 OpenAI)
```

#### 请求参数

| 参数 | 类型 | 是否必填 | 描述 | 默认值 |
|------|------|----------|------|--------|
| `model` | string | ✓ | 使用的模型 ID，如 `deepseek-chat` 或 `deepseek-reasoner` | - |
| `messages` | array | ✓ | 对话消息列表，至少包含一条消息 | - |
| `temperature` | number | ✗ | 采样温度 (0-2)，值越高输出越随机 | 1.0 |
| `top_p` | number | ✗ | 核采样 (0-1)，控制输出多样性，不建议与 temperature 同时修改 | 1.0 |
| `frequency_penalty` | number | ✗ | 频率惩罚 (-2 至 2)，降低重复内容概率 | 0 |
| `presence_penalty` | number | ✗ | 存在惩罚 (-2 至 2)，增加新主题概率 | 0 |
| `max_tokens` | integer | ✗ | 最大输出 token 数 (1-8192) | 4096 |
| `stream` | boolean | ✗ | 是否启用流式输出 (SSE) | false |
| `stream_options` | object | ✗ | 流式输出选项 (仅 stream=true 时有效) | null |
| `response_format` | object | ✗ | 响应格式，支持 `{"type": "text"}` 或 `{"type": "json_object"}` | `{"type": "text"}` |
| `stop` | string/array | ✗ | 停止序列，最多 16 个字符串 | null |
| `tools` | array | ✗ | 工具列表，支持函数调用 | null |
| `tool_choice` | string/object | ✗ | 工具调用策略: `none`/`auto`/`required` | auto (有工具时) |
| `logprobs` | boolean | ✗ | 是否返回 token 对数概率 | false |
| `top_logprobs` | integer | ✗ | 返回 top N 概率 token (0-20) | null |

#### 消息对象结构
```json
{
  "role": "system/user/assistant/tool",  // 消息角色，必填
  "content": "消息内容",                 // 消息内容，必填
  "name": "可选名称",                    // 区分相同角色的参与者
  "tool_call_id": "工具调用 ID"          // 仅 tool 角色需要，对应工具调用的 ID
}
```

#### 工具对象结构 (Function Calling)
```json
{
  "type": "function",
  "function": {
    "name": "函数名称",                  // 必须由 a-z、A-Z、0-9、下划线和连字符组成，最大 64 字符
    "description": "函数功能描述",
    "parameters": {                     // JSON Schema 格式的参数描述
      "type": "object",
      "properties": {
        "param1": {"type": "string"},
        "param2": {"type": "integer"}
      },
      "required": ["param1"]
    }
  }
}
```

#### 响应格式 (非流式)
```json
{
  "id": "chatcmpl-xxxxxx",
  "object": "chat.completion",
  "created": 1735689600,
  "model": "deepseek-chat",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "响应内容",
        "reasoning_content": "推理内容 (仅 reasoner 模型)",
        "tool_calls": [                  // 工具调用结果 (如果有)
          {
            "id": "call_xxxxxx",
            "type": "function",
            "function": {
              "name": "函数名称",
              "arguments": "JSON 格式参数"
            }
          }
        ]
      },
      "finish_reason": "stop/length/content_filter/tool_calls"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "prompt_cache_hit_tokens": 5,
    "prompt_cache_miss_tokens": 5,
    "total_tokens": 30,
    "completion_tokens_details": {
      "reasoning_tokens": 5              // 推理 token 数 (仅 reasoner 模型)
    }
  }
}
```

#### 响应格式 (流式)
流式响应使用 SSE 格式，每个数据块为:
```
data: {"id":"chatcmpl-xxxxxx","object":"chat.completion.chunk","created":1735689600,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"部分内容"}}]}
```
结束标志:
```
data: [DONE]
```

### 3.2 文本补全接口 (Completions)
用于文本续写和生成，接口地址:
```
POST /completions
POST /v1/completions (兼容 OpenAI)
```

#### 核心参数
| 参数 | 类型 | 是否必填 | 描述 |
|------|------|----------|------|
| `model` | string | ✓ | 模型 ID |
| `prompt` | string/array | ✓ | 输入文本 |
| `max_tokens` | integer | ✗ | 最大输出 token 数 |
| `temperature` | number | ✗ | 采样温度 |
| `top_p` | number | ✗ | 核采样 |
| `n` | integer | ✗ | 生成结果数量 |
| `stream` | boolean | ✗ | 流式输出 |
| `logprobs` | integer | ✗ | 返回 token 对数概率 |
| `stop` | string/array | ✗ | 停止序列 |
| `frequency_penalty` | number | ✗ | 频率惩罚 |
| `presence_penalty` | number | ✗ | 存在惩罚 |

---

## 四、错误码与处理

| 错误码 | 描述 | 解决方法 |
|--------|------|----------|
| 400 - Invalid Format | 请求体格式错误 | 检查 JSON 格式，根据错误提示修改 |
| 401 - Authentication Fails | 认证失败 | 检查 API 密钥是否正确 |
| 402 - Insufficient Balance | 余额不足 | 充值账户 |
| 422 - Invalid Parameters | 参数无效 | 检查参数类型和取值范围 |
| 429 - Rate Limit Reached | 超出速率限制 | 降低请求频率，实现重试机制 |
| 500 - Server Error | 服务器内部错误 | 短暂等待后重试，问题持续联系技术支持 |
| 503 - Server Overloaded | 服务器过载 | 稍后重试 |

错误响应示例:
```json
{
  "error": {
    "message": "Invalid API key",
    "type": "invalid_request_error",
    "param": null,
    "code": "authentication_error"
  }
}
```

---

## 五、调用示例

### 5.1 Curl 示例
```bash
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant"},
      {"role": "user", "content": "Hello! How are you?"}
    ],
    "temperature": 0.7,
    "max_tokens": 2048,
    "stream": false
  }'
```

### 5.2 Python 示例 (使用 OpenAI SDK)
```python
# 安装依赖: pip3 install openai
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "system", "content": "You are a helpful assistant"},
        {"role": "user", "content": "Hello! How are you?"}
    ],
    temperature=0.7,
    max_tokens=2048,
    stream=False
)

print(response.choices[0].message.content)
```

### 5.3 Python 流式示例
```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

stream = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "user", "content": "Write a 100-word essay about AI"}
    ],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### 5.4 Node.js 示例
```javascript
// 安装依赖: npm install openai
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "You are a helpful assistant" },
      { role: "user", content: "Hello! How are you?" }
    ]
  });

  console.log(completion.choices[0].message.content);
}

main();
```

---

## 六、特殊功能使用

### 6.1 JSON 输出模式
强制模型输出 JSON 格式:
```json
{
  "model": "deepseek-chat",
  "messages": [
    {"role": "system", "content": "Output only valid JSON"},
    {"role": "user", "content": "Return a JSON object with name and age"}
  ],
  "response_format": { "type": "json_object" }
}
```
注意: 使用 JSON 模式时，必须通过系统或用户消息明确指示模型生成 JSON

### 6.2 思考模式 (Reasoner 模型)
```python
response = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=[
        {"role": "user", "content": "What is 2+2*2?"}
    ]
)

# 获取推理内容和最终答案
reasoning = response.choices[0].message.reasoning_content
answer = response.choices[0].message.content
print(f"推理: {reasoning}")
print(f"答案: {answer}")
```

### 6.3 函数调用示例
```python
tools = [
  {
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "Get weather information for a location",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {"type": "string", "description": "City name"},
          "date": {"type": "string", "format": "YYYY-MM-DD", "description": "Date for weather forecast"}
        },
        "required": ["location"]
      }
    }
  }
]

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "What's the weather in Beijing tomorrow?"}],
    tools=tools,
    tool_choice="auto"
)
```

---

## 七、价格与限制

### 7.1 价格 (USD)
| 模型 | 上下文长度 | 输入价格 (1M token) | 输出价格 (1M token) | 缓存命中输入价格 (1M token) |
|------|------------|---------------------|---------------------|------------------------------|
| deepseek-chat | 128K | $0.28 | $0.42 | $0.07 |
| deepseek-reasoner | 128K | $0.56 | $0.84 | $0.14 |

价格可能调整，请以 [官方文档](https://api-docs.deepseek.com/quick_start/pricing/) 为准

### 7.2 速率限制
- 免费用户: 10 RPM (每分钟请求数)
- 付费用户: 根据套餐不同，最高可达 1000 RPM
- 建议实现指数退避重试机制处理 429 错误

---

## 八、技术支持

- 邮箱: api-service@deepseek.com
- 官方文档: https://api-docs.deepseek.com
- 社区论坛: https://deepseek.csdn.net

需要我把这份文档整理成可直接复制使用的最小化调用模板（含 curl、Python、Node.js 的最简请求/流式请求）吗？