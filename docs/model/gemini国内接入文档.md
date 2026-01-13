# Gemini Generate Content
Google Gemini API 支持使用图片、音频、代码、工具等生成内容。支持文本生成、视觉理解、音频处理、长上下文、代码执行、JSON 模式、函数调用等多种功能。

官方文档：Google Gemini Generating content API

## 生成内容¶
生成模型响应。

POST /v1beta/models/{model}:generateContent

### Authorizations¶
| 参数 | 类型 | 位置 | 必填 | 说明 |
| ---- | ---- | ---- | ---- | ---- |
| key | string | query | 是 | API 密钥，格式：?key=$API_KEY |

### Path Parameters¶
| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| model | string | 是 | 模型名称。格式：models/{model}，例如 models/gemini-3-pro-preview |

### Body¶
application/json

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| contents | array | 是 | 与模型当前对话的内容 |
| tools | array | 否 | 模型可用的工具列表（函数、代码执行等） |
| toolConfig | object | 否 | 工具配置 |
| safetySettings | array | 否 | 安全设置，用于屏蔽不安全内容 |
| systemInstruction | object | 否 | 系统指令 |
| generationConfig | object | 否 | 生成配置 |
| cachedContent | string | 否 | 缓存内容名称 |

### contents 子属性¶
| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| parts | array | 是 | 内容部分，构成单个消息 |
| role | string | 否 | 角色。可选值：user、model、function、tool |

### parts 子属性¶
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| text | string | 纯文本内容 |
| inlineData | object | 内联媒体数据（mimeType + data） |
| fileData | object | 上传文件的URI引用（mimeType + fileUri） |
| functionCall | object | 函数调用请求 |
| functionResponse | object | 函数调用响应 |
| executableCode | object | 可执行代码 |
| codeExecutionResult | object | 代码执行结果 |

### generationConfig 子属性¶
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| stopSequences | array | 停止序列（最多5个） |
| responseMimeType | string | 响应MIME类型。可选：text/plain、application/json、text/x.enum |
| responseSchema | object | 输出架构（JSON Schema格式） |
| candidateCount | integer | 返回的候选数量 |
| maxOutputTokens | integer | 最大输出令牌数 |
| temperature | number | 温度参数，范围 [0.0, 2.0] |
| topP | number | 累计概率上限 |
| topK | integer | 采样令牌数量上限 |
| seed | integer | 解码种子 |
| presencePenalty | number | 存在性惩罚 |
| frequencyPenalty | number | 频率惩罚 |

### safetySettings 子属性¶
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| category | string | 安全类别 |
| threshold | string | 屏蔽阈值 |

#### HarmCategory 可选值：
- HARM_CATEGORY_HARASSMENT - 骚扰内容
- HARM_CATEGORY_HATE_SPEECH - 仇恨言论
- HARM_CATEGORY_SEXUALLY_EXPLICIT - 露骨色情内容
- HARM_CATEGORY_DANGEROUS_CONTENT - 危险内容
- HARM_CATEGORY_CIVIC_INTEGRITY - 破坏公民诚信的内容

#### HarmBlockThreshold 可选值：
- BLOCK_LOW_AND_ABOVE - 只允许 NEGLIGIBLE 级别
- BLOCK_MEDIUM_AND_ABOVE - 允许 NEGLIGIBLE 和 LOW 级别
- BLOCK_ONLY_HIGH - 允许 NEGLIGIBLE、LOW 和 MEDIUM 级别
- BLOCK_NONE - 允许所有内容
- OFF - 关闭安全过滤器

### Response¶
#### 200 - 成功响应¶
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| candidates | array | 候选回答列表 |
| promptFeedback | object | 提示反馈（内容过滤相关） |
| usageMetadata | object | 令牌用量元数据 |
| modelVersion | string | 模型版本 |
| responseId | string | 响应ID |

##### candidates 子属性¶
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| content | object | 生成的内容 |
| finishReason | string | 停止原因 |
| safetyRatings | array | 安全评分列表 |
| tokenCount | integer | 令牌数 |
| index | integer | 候选索引 |

###### finishReason 可选值：
- STOP - 自然停止
- MAX_TOKENS - 达到令牌上限
- SAFETY - 安全原因停止
- RECITATION - 背诵原因
- OTHER - 其他原因

##### usageMetadata 子属性¶
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| promptTokenCount | integer | 提示令牌数 |
| candidatesTokenCount | integer | 候选令牌数 |
| totalTokenCount | integer | 总令牌数 |

### 请求示例¶
cURL
Python (官方 SDK)
聊天对话
系统指令
生成配置
JSON 模式
代码执行

```python
from google import genai

# 直接在 Client 中设置自定义 base URL
client = genai.Client(
    api_key="YOUR_API_KEY",
    http_options={"base_url": "https://cdn.12ai.org"}
)

response = client.models.generate_content(
    model="gemini-3-pro-preview",
    contents="Write a story about a magic backpack.",
)

print(response.text)
```

### 响应示例¶
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "你好！我是 Gemini，一个由 Google 开发的人工智能助手。"
          }
        ],
        "role": "model"
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": [
        {
          "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          "probability": "NEGLIGIBLE",
          "blocked": false
        },
        {
          "category": "HARM_CATEGORY_HATE_SPEECH",
          "probability": "NEGLIGIBLE",
          "blocked": false
        }
      ],
      "tokenCount": 47
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 4,
    "candidatesTokenCount": 47,
    "totalTokenCount": 51
  },
  "modelVersion": "gemini-3-pro-preview",
  "responseId": "response-12345"
}
```

## 流式生成内容¶
流式生成模型响应。

POST /v1beta/models/{model}:streamGenerateContent

### Authorizations¶
| 参数 | 类型 | 位置 | 必填 | 说明 |
| ---- | ---- | ---- | ---- | ---- |
| key | string | query | 是 | API 密钥，格式：?key=$API_KEY |
| alt | string | query | 否 | 设置为 sse 启用 Server-Sent Events 格式 |

### Path Parameters¶
| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| model | string | 是 | 模型名称。格式：models/{model} |

### Body¶
与生成内容接口相同。

### 请求示例¶
```bash
curl "https://cdn.12ai.org/v1beta/models/gemini-3-pro-preview:streamGenerateContent?alt=sse&key=$API_KEY" \
  -H 'Content-Type: application/json' \
  --no-buffer \
  -d '{
    "contents": [{
      "parts": [{"text": "写一个关于魔法背包的故事"}]
    }]
  }'
```

## 高级功能¶
### 图像分析¶
限制

仅支持通过 inline_data 以 base64 方式上传图片。

```bash
curl "https://cdn.12ai.org/v1beta/models/gemini-3-pro-preview:generateContent?key=$API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Tell me about this image"},
        {
          "inline_data": {
            "mime_type": "image/jpeg",
            "data": "<BASE64_IMAGE_DATA>"
          }
        }
      ]
    }]
  }'
```

### 音频处理¶
限制

仅支持通过 inline_data 以 base64 方式上传音频，不支持 file_data.file_uri 或 File API。

```bash
curl "https://cdn.12ai.org/v1beta/models/gemini-3-pro-preview:generateContent?key=$API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Please describe this audio file."},
        {"inline_data": {"mime_type": "audio/mpeg", "data": "<BASE64_AUDIO_DATA>"}}
      ]
    }]
  }'
```

### 视频处理¶
限制

仅支持通过 inline_data 以 base64 方式上传视频，不支持 file_data.file_uri 或 File API。

```bash
curl "https://cdn.12ai.org/v1beta/models/gemini-3-pro-preview:generateContent?key=$API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Transcribe the audio from this video."},
        {"inline_data": {"mime_type": "video/mp4", "data": "<BASE64_VIDEO_DATA>"}}
      ]
    }]
  }'
```

### PDF 处理¶
限制

仅支持通过 inline_data 以 base64 方式上传 PDF，不支持 file_data.file_uri 或 File API。

```bash
curl "https://cdn.12ai.org/v1beta/models/gemini-3-pro-preview:generateContent?key=$API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Summarize this document."},
        {"inline_data": {"mime_type": "application/pdf", "data": "<BASE64_PDF_DATA>"}}
      ]
    }]
  }'
```

### 函数调用¶
```bash
curl "https://cdn.12ai.org/v1beta/models/gemini-3-pro-preview:generateContent?key=$API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "system_instruction": {
      "parts": {
        "text": "You are a helpful lighting system bot."
      }
    },
    "tools": [{
      "function_declarations": [
        {
          "name": "enable_lights",
          "description": "Turn on the lighting system."
        },
        {
          "name": "set_light_color",
          "description": "Set the light color.",
          "parameters": {
            "type": "object",
            "properties": {
              "rgb_hex": {
                "type": "string",
                "description": "The light color as a 6-digit hex string."
              }
            },
            "required": ["rgb_hex"]
          }
        }
      ]
    }],
    "tool_config": {
      "function_calling_config": {"mode": "auto"}
    },
    "contents": {
      "role": "user",
      "parts": {"text": "Turn on the lights please."}
    }
  }'
```

## 错误处理¶
### 常见错误码¶
| 错误码 | 状态 | 描述 | 解决方案 |
| ---- | ---- | ---- | ---- |
| 400 | INVALID_ARGUMENT | 请求参数无效 | 检查请求参数格式 |
| 401 | UNAUTHENTICATED | API密钥无效 | 检查API密钥有效性 |
| 403 | PERMISSION_DENIED | 权限不足 | 检查API密钥权限 |
| 404 | NOT_FOUND | 模型不存在 | 验证模型名称 |
| 429 | RESOURCE_EXHAUSTED | 请求频率超限 | 降低请求频率 |
| 500 | INTERNAL | 服务器内部错误 | 重试请求 |

### 错误响应示例¶
```json
{
  "error": {
    "code": 400,
    "message": "Invalid argument: contents",
    "status": "INVALID_ARGUMENT",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.BadRequest",
        "fieldViolations": [
          {
            "field": "contents",
            "description": "contents is required"
          }
        ]
      }
    ]
  }
}
```

我可以帮你把这份文档里的**错误码和解决方案**整理成一份简洁的速查表，需要吗？