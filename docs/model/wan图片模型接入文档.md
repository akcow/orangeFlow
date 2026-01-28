# 通义万相-文生图V2版API参考
更新时间：2025-12-30 21:49:29

## 产品详情
我的收藏

通义万相-文生图模型基于文本生成图像，支持多种艺术风格与写实摄影效果，满足多样化创意需求。

快速入口：[在线体验（北京｜新加坡）](https://help.aliyun.com/zh/model-studio/developer-reference/text-to-image-v2-api-reference) ｜ [通义万相官网](https://help.aliyun.com/zh/model-studio/developer-reference/text-to-image-v2-api-reference) ｜ [文生图使用指南](https://help.aliyun.com/zh/model-studio/developer-reference/text-to-image-v2-api-reference)

## 说明
通义万相官网的功能与API支持的能力可能存在差异。本文档以API的实际能力为准，并会随功能更新及时同步。

---

## 模型概览

| 模型名称 | 模型简介 | 输出图像格式 |
|---------|---------|------------|
| wan2.6-t2i 推荐 | 万相2.6<br><br>支持在总像素面积与宽高比约束内，自由选尺寸（同wan2.5）<br><br>图像分辨率：总像素在[1280*1280, 1440*1440]之间<br><br>图像宽高比：[1:4, 4:1] | 图像格式：png |
| wan2.5-t2i-preview 推荐 | 万相2.5 preview<br><br>支持在总像素面积与宽高比约束内，自由选尺寸<br><br>例如，支持768*2700，而2.2及以下版本单边上限 1400 | - |
| wan2.2-t2i-flash | 万相2.2极速版<br><br>较2.1模型速度提升50%<br><br>图像分辨率：宽高均在[512, 1440]像素之间 | 图像格式：png |
| wan2.2-t2i-plus | 万相2.2专业版<br><br>较2.1模型稳定性与成功率全面提升 | - |
| wanx2.1-t2i-turbo | 万相2.1极速版 | - |
| wanx2.1-t2i-plus | 万相2.1专业版 | - |
| wanx2.0-t2i-turbo | 万相2.0极速版 | - |

### 说明
调用前，请查阅各地域支持的模型列表。

- wan2.6模型：支持HTTP同步调用、HTTP异步调用，暂不支持SDK调用。
- wan2.5及以下版本模型：支持HTTP异步调用、DashScope SDK调用，不支持HTTP同步调用。

---

## 前提条件
在调用前，先获取与配置 API Key，再配置API Key到环境变量。如需通过SDK进行调用，请安装DashScope SDK。

### 重要
北京和新加坡地域拥有独立的 API Key 与请求地址，不可混用，跨地域调用将导致鉴权失败或服务报错。

---

## HTTP同步调用（wan2.6）
### 重要
本章节接口为新版协议，仅支持 wan2.6模型。

一次请求即可获得结果，流程简单，推荐大多数场景使用。

**北京地域**：POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation  
**新加坡地域**：POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation

### 请求参数
#### 文生图
```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header 'Content-Type: application/json' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--data '{
    "model": "wan2.6-t2i",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "text": "一间有着精致窗户的花店，漂亮的木质门，摆放着花朵"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "prompt_extend": true,
        "watermark": false,
        "n": 1,
        "negative_prompt": "",
        "size": "1280*1280"
    }
}'
```

#### 请求头（Headers）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| Content-Type | string（必选） | 请求内容类型。此参数必须设置为application/json。 |
| Authorization | string（必选） | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |

#### 请求体（Request Body）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| model | string（必选） | 模型名称。示例值：wan2.6-t2i。<br><br>**说明**<br>wan2.5及以下版本模型，HTTP调用请参见HTTP异步调用。 |
| input | object（必选） | 输入的基本信息。 |
| | messages array（必选） | 请求内容数组。当前仅支持单轮对话，即传入一组role、content参数，不支持多轮对话。 |
| | | role string（必选）：消息的角色。此参数必须设置为user。 |
| | | content array（必选）：消息内容数组。 |
| | | | text string（必选）：正向提示词，用于描述期望生成的图像内容、风格和构图。<br><br>支持中英文，长度不超过2100个字符，每个汉字、字母、数字或符号计为一个字符，超过部分会自动截断。<br><br>示例值：一只坐着的橘黄色的猫，表情愉悦，活泼可爱，逼真准确.<br><br>**注意**：仅支持传入一个text，不传或传入多个将报错。 |
| parameters | object（可选） | 图像处理参数。 |
| | negative_prompt string（可选） | 反向提示词，用于描述不希望在图像中出现的内容，对画面进行限制。<br><br>支持中英文，长度不超过500个字符，超出部分将自动截断。<br><br>示例值：低分辨率、错误、最差质量、低质量、残缺、多余的手指、比例不良等。 |
| | size string（可选） | 输出图像的分辨率，格式为宽*高。<br><br>默认值为 1280*1280。<br><br>总像素在 [1280*1280, 1440*1440] 之间且宽高比范围为 [1:4, 4:1]。例如，768*2700符合要求。<br><br>示例值：1280*1280。 |
| | | **常见比例推荐的分辨率**<br>1:1：1280*1280<br>3:4：1104*1472<br>4:3：1472*1104<br>9:16：960*1696<br>16:9：1696*960 |
| | n integer（可选） | **重要**<br>n直接影响费用。费用 = 单价 × 图片张数，请在调用前确认模型价格。<br><br>生成图片的数量。取值范围为1~4张，默认为4。<br><br>**注意**：按张计费，测试建议设为 1。 |
| | prompt_extend bool（可选） | 是否开启提示词智能改写。开启后，将使用大模型优化正向提示词，对较短的提示词有明显提升效果，但增加3-4秒耗时。<br><br>true：默认值，开启智能改写。<br>false：关闭智能改写。 |
| | watermark bool（可选） | 是否添加水印标识，水印位于图片右下角，文案固定为“AI生成”。<br><br>false：默认值，不添加水印。<br>true：添加水印。 |
| | seed integer（可选） | 随机数种子，取值范围[0,2147483647]。<br><br>使用相同的seed参数值可使生成内容保持相对稳定。若不提供，算法将自动使用随机数种子。<br><br>**注意**：模型生成过程具有概率性，即使使用相同的seed，也不能保证每次生成结果完全一致。 |

### 响应参数
#### 任务执行成功
#### 任务执行异常
任务数据（如任务状态、图像URL等）仅保留24小时，超时后会被自动清除。请您务必及时保存生成的图像。

```json
{
    "output": {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "content": [
                        {
                            "image": "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/xxxx.png?Expires=xxx",
                            "type": "image"
                        }
                    ],
                    "role": "assistant"
                }
            }
        ],
        "finished": true
    },
    "usage": {
        "image_count": 1,
        "input_tokens": 0,
        "output_tokens": 0,
        "size": "1280*1280",
        "total_tokens": 0
    },
    "request_id": "815505c6-7c3d-49d7-b197-xxxxx"
}
```

| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| output | object | 任务输出信息。 |
| | choices array | 模型生成的输出内容。 |
| | | finish_reason string：任务停止原因，自然停止时为stop。 |
| | | message object：模型返回的消息。 |
| | | | role string：消息的角色，固定为assistant。 |
| | | | content array |
| | | | | image string：生成图像的 URL，图像格式为PNG。链接有效期为24小时，请及时下载并保存图像。 |
| | | | | type string：输出的类型，固定为image。 |
| | finished boolean | 任务是否结束。<br>true：已结束。<br>false：未结束。 |
| usage | object | 输出信息统计。只对成功的结果计数。 |
| | image_count integer | 生成图像的张数。 |
| | size string | 生成的图像分辨率。示例值：1280*1280。 |
| | input_tokens integer | 输入token。文生图按图片张数计费，当前固定为0。 |
| | output_tokens integer | 输出token。文生图按图片张数计费，当前固定为0。 |
| | total_tokens integer | 总token。文生图按图片张数计费，当前固定为0。 |
| request_id | string | 请求唯一标识。可用于请求明细溯源和问题排查。 |
| code | string | 请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。 |
| message | string | 请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。 |

---

## HTTP异步调用（wan2.6）
### 重要
本章节接口为新版协议，仅支持 wan2.6模型。

适用于对超时敏感的场景。整个流程包含 “创建任务 -> 轮询获取” 两个核心步骤，具体如下：

### 步骤1：创建任务获取任务ID
**北京地域**：POST https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation  
**新加坡地域**：POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/image-generation/generation

#### 说明
创建成功后，使用接口返回的 task_id 查询结果，task_id 有效期为 24 小时。请勿重复创建任务，轮询获取即可。

新手指引请参见Postman。

#### 请求参数
##### 文生图
```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation' \
--header 'Content-Type: application/json' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'X-DashScope-Async: enable' \
--data '{
    "model": "wan2.6-t2i",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "text": "一间有着精致窗户的花店，漂亮的木质门，摆放着花朵"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "prompt_extend": true,
        "watermark": false,
        "n": 1,
        "negative_prompt": "",
        "size": "1280*1280"
    }
}'
```

#### 请求头（Headers）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| Content-Type | string（必选） | 请求内容类型。此参数必须设置为application/json。 |
| Authorization | string（必选） | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |
| X-DashScope-Async | string（必选） | 异步处理配置参数。HTTP异步调用，必须设置为enable。<br><br>**重要**<br>缺少此请求头将报错：“current user api does not support synchronous calls”。 |

#### 请求体（Request Body）
与HTTP同步调用的请求体参数相同，此处不再赘述。

#### 响应参数
##### 成功响应
##### 异常响应
请保存 task_id，用于查询任务状态与结果。

```json
{
    "output": {
        "task_status": "PENDING",
        "task_id": "0385dc79-5ff8-4d82-bcb6-xxxxxx"
    },
    "request_id": "4909100c-7b5a-9f92-bfe5-xxxxxx"
}
```

| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| output | object | 任务输出信息。 |
| | task_id string | 任务ID。查询有效期24小时。 |
| | task_status string | 任务状态。<br>枚举值<br>PENDING：任务排队中<br>RUNNING：任务处理中<br>SUCCEEDED：任务执行成功<br>FAILED：任务执行失败<br>CANCELED：任务已取消<br>UNKNOWN：任务不存在或状态未知 |
| request_id | string | 请求唯一标识。可用于请求明细溯源和问题排查。 |
| code | string | 请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。 |
| message | string | 请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。 |

### 步骤2：根据任务ID查询结果
**北京地域**：GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}  
**新加坡地域**：GET https://dashscope-intl.aliyuncs.com/api/v1/tasks/{task_id}

#### 说明
- 轮询建议：图像生成过程约需数分钟，建议采用轮询机制，并设置合理的查询间隔（如 10 秒）来获取结果。
- 任务状态流转：PENDING（排队中）→ RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。
- 结果链接：任务成功后返回图像链接，有效期为 24 小时。建议在获取链接后立即下载并转存至永久存储（如阿里云 OSS）。
- QPS 限制：查询接口默认QPS为20。如需更高频查询或事件通知，建议配置异步任务回调。
- 更多操作：如需批量查询、取消任务等操作，请参见管理异步任务。

#### 请求参数
##### 查询任务结果
请将86ecf553-d340-4e21-xxxxxxxxx替换为真实的task_id.

```bash
curl -X GET https://dashscope.aliyuncs.com/api/v1/tasks/86ecf553-d340-4e21-xxxxxxxxx \
--header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

#### 请求头（Headers）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| Authorization | string（必选） | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |

#### URL路径参数（Path parameters）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| task_id | string（必选） | 任务ID。 |

#### 响应参数
##### 任务执行成功
##### 任务执行异常
任务数据（如任务状态、图像URL等）仅保留24小时，超时后会被自动清除。请您务必及时保存生成的图像。

```json
{
    "request_id": "2ddf53fa-699a-4267-9446-xxxxxx",
    "output": {
        "task_id": "3cd3fa4e-53ee-4136-9cab-xxxxxx",
        "task_status": "SUCCEEDED",
        "submit_time": "2025-12-18 20:03:01.802",
        "scheduled_time": "2025-12-18 20:03:01.834",
        "end_time": "2025-12-18 20:03:29.260",
        "finished": true,
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "image": "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/xxx.png?Expires=xxx",
                            "type": "image"
                        }
                    ]
                }
            }
        ]
    },
    "usage": {
        "size": "1280*1280",
        "total_tokens": 0,
        "image_count": 1,
        "output_tokens": 0,
        "input_tokens": 0
    }
}
```

| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| output | object | 任务输出信息。 |
| | task_id string | 任务ID。查询有效期24小时。 |
| | task_status string | 任务状态。<br>枚举值<br>PENDING：任务排队中<br>RUNNING：任务处理中<br>SUCCEEDED：任务执行成功<br>FAILED：任务执行失败<br>CANCELED：任务已取消<br>UNKNOWN：任务不存在或状态未知<br><br>轮询过程中的状态流转：<br>PENDING（排队中） → RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。<br>初次查询状态通常为 PENDING（排队中）或 RUNNING（处理中）。<br>当状态变为 SUCCEEDED 时，响应中将包含生成的图像url。<br>若状态为 FAILED，请检查错误信息并重试。 |
| | submit_time string | 任务提交时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 |
| | scheduled_time string | 任务执行时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 |
| | end_time string | 任务完成时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 |
| | finished boolean | 任务是否结束。<br>true：已结束。<br>false：未结束。 |
| | choices array | 模型生成的输出内容。 |
| | | finish_reason string：任务停止原因，正常完成时为 stop。 |
| | | message object：模型返回的消息。 |
| | | | role string：消息的角色，固定为assistant。 |
| | | | content array |
| | | | | image string：生成图像的 URL，图像格式为PNG。<br>链接有效期为24小时，请及时下载并保存图像。 |
| | | | | type string：输出的类型，固定为image。 |
| usage | object | 输出信息统计。只对成功的结果计数。 |
| | image_count integer | 生成图像的张数。 |
| | size string | 生成的图像分辨率。示例值：1280*1280。 |
| | input_tokens integer | 输入token数量。当前固定为0。 |
| | output_tokens integer | 输出token数量。当前固定为0。 |
| | total_tokens integer | 总token数量。当前固定为0。 |
| request_id | string | 请求唯一标识。可用于请求明细溯源和问题排查。 |
| code | string | 请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。 |
| message | string | 请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。 |

---

## HTTP异步调用（wan2.5及以下版本模型）
### 重要
此接口为旧版协议，仅支持wan2.5及以下版本模型。

由于文生图任务耗时较长（通常为1-2分钟），API采用异步调用。整个流程包含 “创建任务 -> 轮询获取” 两个核心步骤，具体如下：

具体耗时受限于排队任务数和服务执行情况，请在获取结果时耐心等待。

### 步骤1：创建任务获取任务ID
**北京地域**：POST https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis  
**新加坡地域**：POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis

#### 说明
创建成功后，使用接口返回的 task_id 查询结果，task_id 有效期为 24 小时。请勿重复创建任务，轮询获取即可。

新手指引请参见Postman。

#### 请求参数
##### 文生图
```bash
curl -X POST https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.5-t2i-preview",
    "input": {
        "prompt": "一间有着精致窗户的花店，漂亮的木质门，摆放着花朵"
    },
    "parameters": {
        "size": "1280*1280",
        "n": 1
    }
}'    
```

##### 文生图（使用反向提示词）
```bash
curl -X POST https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.5-t2i-preview",
    "input": {
        "prompt": "一间有着精致窗户的花店，漂亮的木质门，摆放着花朵",
        "negative_prompt": "低分辨率、模糊、比例失调"
    },
    "parameters": {
        "size": "1280*1280",
        "n": 1,
        "prompt_extend": true,
        "watermark": false,
        "seed": 12345
    }
}'
```

#### 请求头（Headers）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| Content-Type | string（必选） | 请求内容类型。此参数必须设置为application/json。 |
| Authorization | string（必选） | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |
| X-DashScope-Async | string（必选） | 异步处理配置参数。HTTP请求只支持异步，必须设置为enable。<br><br>**重要**<br>缺少此请求头将报错：“current user api does not support synchronous calls”。 |

#### 请求体（Request Body）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| model | string（必选） | 模型名称。文生图模型请参见模型列表。<br>示例值：wan2.5-t2i-preview。<br><br>**说明**<br>wan2.6模型的HTTP调用请参见HTTP同步调用、HTTP异步调用。 |
| input | object（必选） | 输入的基本信息，如提示词等。 |
| | prompt string（必选） | 正向提示词，用来描述生成图像中期望包含的元素和视觉特点。<br><br>支持中英文，每个汉字/字母/标点符号占一个字符，超过部分会自动截断。长度限制因模型版本而异：<br>wan2.5-t2i-preview：长度不超过2000个字符。<br>wan2.2及以下版本模型：长度不超过800个字符。<br><br>示例值：一只坐着的橘黄色的猫，表情愉悦，活泼可爱，逼真准确。<br><br>提示词的使用技巧请参见文生图Prompt指南。 |
| | negative_prompt string（可选） | 反向提示词，用来描述不希望在画面中看到的内容，可以对画面进行限制。<br><br>支持中英文，长度不超过500个字符，超过部分会自动截断。<br><br>示例值：低分辨率、错误、最差质量、低质量、残缺、多余的手指、比例不良等。 |
| parameters | object（可选） | 图像处理参数。如设置图像分辨率、开启prompt智能改写、添加水印等。 |
| | size string（可选） | 输出图像的分辨率，格式为宽*高。默认值和约束因模型版本而异：<br>wan2.5-t2i-preview：默认值为 1280*1280。总像素在 [1280*1280, 1440*1440] 之间且宽高比范围为 [1:4, 4:1]。例如，768*2700符合要求。<br>wan2.2及以下版本模型：默认值为1024*1024。图像宽高在[512, 1440]之间，最大分辨率为1440*1440。例如， 768*2700超单边限制，不支持。<br><br>示例值：1280*1280。 |
| | | **常见比例推荐的分辨率**<br>以下分辨率适用于wan2.5-t2i-preview<br>1:1：1280*1280<br>3:4：1104*1472<br>4:3：1472*1104<br>9:16：960*1696<br>16:9：1696*960 |
| | n integer（可选） | **重要**<br>n直接影响费用。费用 = 单价 × 图片张数，请在调用前确认模型价格。<br><br>生成图片的数量。取值范围为1~4张，默认为4。测试阶段建议设置为1，便于低成本验证。 |
| | prompt_extend boolean（可选） | 是否开启prompt智能改写。开启后使用大模型对输入prompt进行智能改写。对于较短的prompt生成效果提升明显，但会增加耗时。<br>true：默认值，开启智能改写。<br>false：关闭智能改写。<br>示例值：true。 |
| | watermark boolean（可选） | 是否添加水印标识，水印位于图片右下角，文案固定为“AI生成”。<br>false：默认值，不添加水印。<br>true：添加水印。 |
| | seed integer（可选） | 随机数种子，取值范围是[0, 2147483647]。<br><br>如果不提供，则算法自动生成一个随机数作为种子。如果提供，则根据n的值分别为n张图片生成seed参数，例如n=4，算法将分别生成seed、seed+1、seed+2、seed+3作为参数的图片。<br><br>若需提升生成结果的可复现性，建议固定seed值。<br><br>请注意，由于模型生成具有概率性，即使使用相同 seed，也不能保证每次生成结果完全一致。 |

#### 响应参数
##### 成功响应
##### 异常响应
请保存 task_id，用于查询任务状态与结果。

```json
{
    "output": {
        "task_status": "PENDING",
        "task_id": "0385dc79-5ff8-4d82-bcb6-xxxxxx"
    },
    "request_id": "4909100c-7b5a-9f92-bfe5-xxxxxx"
}
```

| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| output | object | 任务输出信息。 |
| | task_id string | 任务ID。查询有效期24小时。 |
| | task_status string | 任务状态。<br>枚举值<br>PENDING：任务排队中<br>RUNNING：任务处理中<br>SUCCEEDED：任务执行成功<br>FAILED：任务执行失败<br>CANCELED：任务已取消<br>UNKNOWN：任务不存在或状态未知 |
| request_id | string | 请求唯一标识。可用于请求明细溯源和问题排查。 |
| code | string | 请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。 |
| message | string | 请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。 |

### 步骤2：根据任务ID查询结果
**北京地域**：GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}  
**新加坡地域**：GET https://dashscope-intl.aliyuncs.com/api/v1/tasks/{task_id}

#### 说明
- 轮询建议：图像生成过程约需数分钟，建议采用轮询机制，并设置合理的查询间隔（如 10 秒）来获取结果。
- 任务状态流转：PENDING（排队中）→ RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。
- 结果链接：任务成功后返回图像链接，有效期为 24 小时。建议在获取链接后立即下载并转存至永久存储（如阿里云 OSS）。
- QPS 限制：查询接口默认QPS为20。如需更高频查询或事件通知，建议配置异步任务回调。
- 更多操作：如需批量查询、取消任务等操作，请参见管理异步任务。

#### 请求参数
##### 查询任务结果
请将86ecf553-d340-4e21-xxxxxxxxx替换为真实的task_id。

```bash
curl -X GET https://dashscope.aliyuncs.com/api/v1/tasks/86ecf553-d340-4e21-xxxxxxxxx \
--header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

#### 请求头（Headers）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| Authorization | string（必选） | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |

#### URL路径参数（Path parameters）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| task_id | string（必选） | 任务ID。 |

#### 响应参数
##### 任务执行成功
##### 任务执行失败
##### 任务部分失败
##### 任务查询过期
图像URL仅保留24小时，超时后会被自动清除，请及时保存生成的图像。

```json
{
    "request_id": "f767d108-7d50-908b-a6d9-xxxxxx",
    "output": {
        "task_id": "d492bffd-10b5-4169-b639-xxxxxx",
        "task_status": "SUCCEEDED",
        "submit_time": "2025-01-08 16:03:59.840",
        "scheduled_time": "2025-01-08 16:03:59.863",
        "end_time": "2025-01-08 16:04:10.660",
        "results": [
            {
                "orig_prompt": "一间有着精致窗户的花店，漂亮的木质门，摆放着花朵",
                "actual_prompt": "一间有着精致雕花窗户的花店，漂亮的深色木质门上挂着铜制把手。店内摆放着各式各样的鲜花，包括玫瑰、百合和向日葵，色彩鲜艳，生机勃勃。背景是温馨的室内场景，透过窗户可以看到街道。高清写实摄影，中景构图。",
                "url": "https://dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com/1.png"
            }
        ],
        "task_metrics": {
            "TOTAL": 1,
            "SUCCEEDED": 1,
            "FAILED": 0
        }
    },
    "usage": {
        "image_count": 1
    }
}
```

| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| output | object | 任务输出信息。 |
| | task_id string | 任务ID。查询有效期24小时。 |
| | task_status string | 任务状态。<br>枚举值<br>PENDING：任务排队中<br>RUNNING：任务处理中<br>SUCCEEDED：任务执行成功<br>FAILED：任务执行失败<br>CANCELED：任务已取消<br>UNKNOWN：任务不存在或状态未知<br><br>轮询过程中的状态流转：<br>PENDING（排队中） → RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。<br>初次查询状态通常为 PENDING（排队中）或 RUNNING（处理中）。<br>当状态变为 SUCCEEDED 时，响应中将包含生成的图像url。<br>若状态为 FAILED，请检查错误信息并重试。 |
| | submit_time string | 任务提交时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 |
| | scheduled_time string | 任务执行时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 |
| | end_time string | 任务完成时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 |
| | results array of object | 任务结果列表，包括图像URL、prompt、部分任务执行失败报错信息等。 |
| | | orig_prompt string：原始输入的prompt，对应请求参数prompt。 |
| | | actual_prompt string：开启 prompt 智能改写后，返回实际使用的优化后 prompt。若未开启该功能，则不返回此字段。 |
| | | url string：图像URL地址。仅在 task_status 为 SUCCEEDED 时返回。链接有效期24小时，可通过此URL下载图像。 |
| | | code string：请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。 |
| | | message string：请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。 |
| | task_metrics object | 任务结果统计。 |
| | | TOTAL integer：总的任务数。 |
| | | SUCCEEDED integer：任务状态为成功的任务数。 |
| | | FAILED integer：任务状态为失败的任务数。 |
| usage | object | 输出信息统计。只对成功的结果计数。 |
| | image_count integer | 模型成功生成图片的数量。计费公式：费用 = 图片数量 × 单价。 |
| request_id | string | 请求唯一标识。可用于请求明细溯源和问题排查。 |
| code | string | 请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。 |
| message | string | 请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。 |

---

## DashScope SDK调用
SDK 的参数命名与HTTP接口基本一致，参数结构根据语言特性进行封装。

由于文生图任务耗时较长（通常为1-2分钟），SDK 在底层封装了 HTTP 异步调用流程，支持同步、异步两种调用方式。

具体耗时受限于排队任务数和服务执行情况，请在获取结果时耐心等待。

### Python SDK调用
#### 重要
wan2.6-t2i模型暂不支持SDK调用。以下代码仅适合wan2.5及以下版本模型。

请确保 DashScope Python SDK 版本不低于 1.25.2，再运行以下代码。

若版本过低，可能会触发 “url error, please check url!” 等错误。请参考安装SDK进行更新。

##### 同步调用
###### 请求示例
```python
from http import HTTPStatus
from urllib.parse import urlparse, unquote
from pathlib import PurePosixPath
import requests
from dashscope import ImageSynthesis
import os
import dashscope

# 以下为北京地域url，若使用新加坡地域的模型，需将url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'

# 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
# 新加坡和北京地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
api_key = os.getenv("DASHSCOPE_API_KEY")

print('----sync call, please wait a moment----')
rsp = ImageSynthesis.call(api_key=api_key,
                          model="wan2.5-t2i-preview",
                          prompt="一间有着精致窗户的花店，漂亮的木质门，摆放着花朵",
                          negative_prompt="",
                          n=1,
                          size='1280*1280',
                          prompt_extend=True,
                          watermark=False,
                          seed=12345)
print('response: %s' % rsp)
if rsp.status_code == HTTPStatus.OK:
    # 在当前目录下保存图片
    for result in rsp.output.results:
        file_name = PurePosixPath(unquote(urlparse(result.url).path)).parts[-1]
        with open('./%s' % file_name, 'wb+') as f:
            f.write(requests.get(result.url).content)
else:
    print('sync_call Failed, status_code: %s, code: %s, message: %s' %
          (rsp.status_code, rsp.code, rsp.message))
```

###### 响应示例
url 有效期24小时，请及时下载图像。

```json
{
    "status_code": 200,
    "request_id": "9d634fda-5fe9-9968-a908-xxxxxx",
    "code": null,
    "message": "",
    "output": {
        "task_id": "d35658e4-483f-453b-b8dc-xxxxxx",
        "task_status": "SUCCEEDED",
        "results": [{
            "url": "https://dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com/1.png",
            "orig_prompt": "一间有着精致窗户的花店，漂亮的木质门，摆放着花朵",
            "actual_prompt": "一间精致的花店，窗户上装饰着优雅的雕花，漂亮的木质门上挂着铜制把手。店内摆放着各种色彩鲜艳的花朵，如玫瑰、郁金香和百合等。背景是温馨的室内场景，光线柔和，营造出宁静舒适的氛围。高清写实摄影，近景中心构图。"
        }],
        "submit_time": "2025-01-08 19:36:01.521",
        "scheduled_time": "2025-01-08 19:36:01.542",
        "end_time": "2025-01-08 19:36:13.270",
        "task_metrics": {
            "TOTAL": 1,
            "SUCCEEDED": 1,
            "FAILED": 0
        }
    },
    "usage": {
        "image_count": 1
    }
}
```

##### 异步调用
（此处省略，与同步调用类似，仅调用方式不同）

### Java SDK调用
#### 重要
wan2.6-t2i模型暂不支持SDK调用。以下代码仅适合wan2.5及以下版本模型。

请确保 DashScope Java SDK 版本不低于 2.22.2，再运行以下代码。

若版本过低，可能会触发 “url error, please check url!” 等错误。请参考安装SDK进行更新。

##### 同步调用
###### 请求示例
```java
// Copyright (c) Alibaba, Inc. and its affiliates.

import com.alibaba.dashscope.aigc.imagesynthesis.ImageSynthesis;
import com.alibaba.dashscope.aigc.imagesynthesis.ImageSynthesisListResult;
import com.alibaba.dashscope.aigc.imagesynthesis.ImageSynthesisParam;
import com.alibaba.dashscope.aigc.imagesynthesis.ImageSynthesisResult;
import com.alibaba.dashscope.task.AsyncTaskListParam;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.utils.Constants;
import com.alibaba.dashscope.utils.JsonUtils;

import java.util.HashMap;
import java.util.Map;

public class Main {

    static {
        // 以下为北京地域url，若使用新加坡地域的模型，需将url替换为：https://dashscope-intl.aliyuncs.com/api/v1
        Constants.baseHttpApiUrl = "https://dashscope.aliyuncs.com/api/v1";
    }

    // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey="sk-xxx"
    // 新加坡和北京地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    static String apiKey = System.getenv("DASHSCOPE_API_KEY");


    public static void basicCall() throws ApiException, NoApiKeyException {
        // 设置parameters参数
        Map<String, Object> parameters = new HashMap<>();
        parameters.put("prompt_extend", true);
        parameters.put("watermark", false);
        parameters.put("seed", 12345);

        ImageSynthesisParam param =
                ImageSynthesisParam.builder()
                        .apiKey(apiKey)
                        .model("wan2.5-t2i-preview")
                        .prompt("一间有着精致窗户的花店，漂亮的木质门，摆放着花朵")
                        .n(1)
                        .size("1280*1280")
                        .negativePrompt("")
                        .parameters(parameters)
                        .build();

        ImageSynthesis imageSynthesis = new ImageSynthesis();
        ImageSynthesisResult result = null;
        try {
            System.out.println("---sync call, please wait a moment----");
            result = imageSynthesis.call(param);
        } catch (ApiException | NoApiKeyException e){
            throw new RuntimeException(e.getMessage());
        }
        System.out.println(JsonUtils.toJson(result));
    }

    public static void listTask() throws ApiException, NoApiKeyException {
        ImageSynthesis is = new ImageSynthesis();
        AsyncTaskListParam param = AsyncTaskListParam.builder().build();
        param.setApiKey(apiKey);
        ImageSynthesisListResult result = is.list(param);
        System.out.println(result);
    }

    public static void fetchTask(String taskId) throws ApiException, NoApiKeyException {
        ImageSynthesis is = new ImageSynthesis();
        // If set DASHSCOPE_API_KEY environment variable, apiKey can null.
        ImageSynthesisResult result = is.fetch(taskId, apiKey);
        System.out.println(result.getOutput());
        System.out.println(result.getUsage());
    }

    public static void main(String[] args){
        try{
            basicCall();
            //listTask();
        }catch(ApiException|NoApiKeyException e){
            System.out.println(e.getMessage());
        }
    }
}
```

###### 响应示例
url 有效期24小时，请及时下载图像。

```json
{
    "request_id": "22f9c744-206c-9a78-899a-xxxxxx",
    "output": {
        "task_id": "4a0f8fc6-03fb-4c44-a13a-xxxxxx",
        "task_status": "SUCCEEDED",
        "results": [{
           "orig_prompt": "一间有着精致窗户的花店，漂亮的木质门，摆放着花朵",
            "actual_prompt": "一间有着精致雕花窗户的花店，漂亮的深色木质门微微敞开。店内摆放着各式各样的鲜花，包括玫瑰、百合和向日葵，色彩鲜艳，香气扑鼻。背景是温馨的室内场景，光线柔和，透过窗户洒在花朵上。高清写实摄影，中景构图。",
            "url": "https://dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com/1.png"
        }],
        "task_metrics": {
            "TOTAL": 1,
            "SUCCEEDED": 1,
            "FAILED": 0
        }
    },
    "usage": {
        "image_count": 1
    }
}
```

##### 异步调用
（此处省略，与同步调用类似，仅调用方式不同）

---

## 使用限制
1. 数据时效：任务task_id和 图像url均只保留 24 小时，过期后将无法查询或下载。
2. 内容审核：输入的 prompt 和输出的图像均会经过内容安全审核，包含违规内容的请求将报错“IPInfringementSuspect”或“DataInspectionFailed”，具体参见错误信息。
3. 网络访问配置：图像链接存储于阿里云 OSS，如果业务系统因安全策略无法访问外部OSS链接，请将以下 OSS 域名加入网络访问白名单。

```
# OSS域名列表
dashscope-result-bj.oss-cn-beijing.aliyuncs.com
dashscope-result-hz.oss-cn-hangzhou.aliyuncs.com
dashscope-result-sh.oss-cn-shanghai.aliyuncs.com
dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com
dashscope-result-zjk.oss-cn-zhangjiakou.aliyuncs.com
dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com
dashscope-result-hy.oss-cn-heyuan.aliyuncs.com
dashscope-result-cd.oss-cn-chengdu.aliyuncs.com
dashscope-result-gz.oss-cn-guangzhou.aliyuncs.com
dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com
```

---

## 计费与限流
模型免费额度和计费单价请参见模型列表。

模型限流请参见通义万相。

### 计费说明：
1. 按成功生成的 图像张数 计费。仅当查询结果接口返回task_status为SUCCEEDED 并成功生成图像后，才会计费。
2. 模型调用失败或处理错误不产生任何费用，也不消耗免费额度。

---

## 错误码
如果模型调用失败并返回报错信息，请参见错误信息进行解决。

---

## 常见问题
**Q: 如何查看模型调用量？**

**A:** 模型调用完一小时后，请在模型观测页面，查看模型的调用次数、成功率等指标。


# 通义万相-图像生成与编辑2.6 API参考
更新时间：2025-12-29 17:51:11

## 产品详情
我的收藏

通义万相图像生成模型支持图像编辑、图文混排输出，满足多样化生成与集成需求。

---

## 模型概览

| 模型名称 | 模型简介 | 输出图像规格 |
|---------|---------|------------|
| wan2.6-image | 万相2.6 image<br><br>支持图像编辑和图文混排输出 | 图片格式：PNG。<br><br>图像分辨率和尺寸请参见size参数。 |

### 说明
调用前，请查阅各地域支持的模型列表与价格。

---

## 前提条件
您需要已获取与配置 API Key并配置API Key到环境变量。

### 重要
北京和新加坡地域拥有独立的 API Key 与请求地址，不可混用，跨地域调用将导致鉴权失败或服务报错。

---

## HTTP同步调用
一次请求即可获得结果，流程简单，推荐大多数场景使用。

**北京地域**：POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation  
**新加坡地域**：POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation

### 请求参数
#### 图像编辑
#### 图文混排（仅支持流式）
```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header 'Content-Type: application/json' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--data '{
    "model": "wan2.6-image",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "text": "参考图1的风格和图2的背景，生成番茄炒蛋"
                    },
                    {
                        "image": "https://cdn.wanx.aliyuncs.com/tmp/pressure/umbrella1.png"
                    },
                    {
                        "image": "https://img.alicdn.com/imgextra/i3/O1CN01SfG4J41UYn9WNt4X1_!!6000000002530-49-tps-1696-960.webp"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "prompt_extend": true,
        "watermark": false,
        "n": 1,
        "enable_interleave": false,
        "size": "1280*1280"
    }
}'
```

### 请求头（Headers）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| Content-Type | string（必选） | 请求内容类型。此参数必须设置为application/json。 |
| Authorization | string（必选） | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |
| X-DashScope-Sse | string（可选） | 用于启用流式输出。<br><br>仅当 parameters.enable_interleave=true 时，必须将该字段设为 enable。<br><br>其他情况下可不传或忽略。 |

### 请求体（Request Body）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| model | string（必选） | 模型名称。<br>示例值：wan2.6-image。 |
| input | object（必选） | 输入的基本信息。 |
| | messages array（必选） | 请求内容数组。当前仅支持单轮对话，即传入一组role、content参数，不支持多轮对话。 |
| | | role string（必选）：消息的角色。此参数固定设置为user。 |
| | | content array（必选）：消息内容数组。 |
| | | | text string（必选）：正向提示词用于描述您期望生成的图像内容、风格和构图。<br><br>支持中英文，长度不超过2000个字符，每个汉字、字母、数字或符号计为一个字符，超过部分会自动截断。<br><br>示例值：参考这个风格的图片，生成番茄炒蛋。<br><br>**注意**：仅支持传入一个text，不传或传入多个将报错。 |
| | | | image string（可选）：输入图像的URL或Base64编码字符串。<br><br>**图像限制**：<br>图像格式：JPEG、JPG、PNG（不支持透明通道）、BMP、WEBP。<br>图像分辨率：图像的宽高范围均为[384, 5000]像素。<br>文件大小：不超过10MB。<br><br>**图像数量限制**：<br>输入图像数量与parameters.enable_interleave参数有关。<br>当enable_interleave=true时（图文混排输出），可输入0~1张图像。<br>当enable_interleave=false时（图像编辑），必须输入1~4张图像。<br>当输入多张图像时，需在content数组中传入多个image对象，并按照数组顺序定义图像顺序。<br><br>**支持的输入格式**：<br>1. 使用公网可访问URL<br>支持 HTTP 或 HTTPS 协议。<br>示例值：http://wanx.alicdn.com/material/xxx.jpeg。<br><br>2. 传入 Base64 编码图像后的字符串<br>格式：data:{MIME_type};base64,{base64_data}<br>示例：data:image/jpeg;base64,GDU7MtCZzEbTbmRZ...（仅示意，实际需传入完整字符串）<br><br>Base64 编码规范请参见图像传入方式。 |
| parameters | object（可选） | 图像处理参数。 |
| | negative_prompt string（可选） | 反向提示词，用于描述不希望在图像中出现的内容，对画面进行限制。<br><br>支持中英文，长度不超过500个字符，超出部分将自动截断。<br><br>示例值：低分辨率、错误、最差质量、低质量、残缺、多余的手指、比例不良等。 |
| | size string（可选） | 输出图像的分辨率，格式为宽*高。<br><br>wan2.6-image：总像素在 [768*768, 1280*1280] （即589824 至 1638400像素）之间，且宽高比范围为 [1:4, 4:1]。例如，768*2700符合要求。<br><br>示例值：1280*1280。<br><br>**常见比例推荐的分辨率**<br>1:1：1280*1280 或 1024*1024<br>2:3：800*1200<br>3:2：1200*800<br>3:4：960*1280<br>4:3：1280*960<br>9:16：720*1280<br>16:9：1280*720<br>21:9：1344*576<br><br>**输出图像尺寸的规则**<br>方式一：指定 size 参数：输出图像严格按 size 指定的宽高生成。<br><br>方式二：未指定 size：输出图像由 总像素上限 和 宽高比规则 共同决定。系统会根据总像素并按照宽高比规则对图像进行处理后输出。<br><br>**总像素规则**：由 enable_interleave 控制。<br>当 enable_interleave=true 时：<br>若输入图像总像素 ≤ 1280*1280，输出总像素与输入一致；<br>若输入图像总像素 > 1280*1280，输出总像素固定为 1280*1280。<br><br>当 enable_interleave=false 时：输出总像素固定为 1280*1280。<br><br>**宽高比规则（近似）**：<br>单图输入：输出宽高比与输入图像一致；<br>多图输入：输出宽高比与最后一张输入图像一致。<br><br>示例：当 enable_interleave=true 且输入 1 张 720*720 的图像时，输出图像为 720*720，宽高比与输入一致。 |
| | enable_interleave bool（可选） | 控制生图模式：<br><br>false：默认值，表示图像编辑模式（支持多图输入及主体一致性生成）。<br>用途：基于1～4张输入图像进行编辑、风格迁移或主体一致性生成。<br>输入：必须提供至少1张参考图像。<br>输出：可生成1至4张结果图像。<br><br>true ：表示启用图文混排输出模式（仅支持传入一张图像或不传图像）。<br>用途：根据文本描述生成图文并茂的内容，或进行纯文本生成图像（文生图）。<br>输入：可以不提供图像（文生图），或提供最多1张参考图像。<br>输出：固定生成1个包含文本和图像的混合内容块。 |
| | n integer（可选） | **重要**<br>n直接影响费用。费用 = 单价 × 成功生成的图片张数，请在调用前确认模型价格。<br><br>指定生成图片的数量。该参数的取值范围与含义取决于 enable_interleave（模式开关）的状态：<br><br>当 enable_interleave=false（图像编辑模式）：<br>作用：直接控制生成图像的数量。<br>取值范围：1～4，默认值为 4。<br>建议在测试阶段将此值设置为 1，以便低成本验证效果。<br><br>当 enable_interleave=true（图文混排模式）：<br>限制：此参数默认为1，且必须固定为1。若设置为其他值，接口将报错。<br>说明：在此模式下，如需控制生成图像的数量上限，请使用 max_images 参数。 |
| | max_images integer（可选） | **重要**<br>max_images影响费用。费用 = 单价 × 成功生成的图片张数，请在调用前确认模型价格。<br><br>仅在图文混排模式（即 enable_interleave=true）下生效。<br><br>作用：指定模型在单次回复中生成图像的最大数量。<br><br>取值范围：1～5，默认值为 5。<br><br>**注意**：该参数仅代表“数量上限”。实际生成的图像数量由模型推理决定，可能会少于设定值（例如：设置为 5，模型可能根据内容仅生成 3 张）。 |
| | prompt_extend bool（可选） | 仅在图像编辑模式（即enable_interleave = false）下生效。<br><br>是否开启 Prompt（提示词）智能改写功能。该功能仅对正向提示词进行优化与润色，不会改变反向提示词。<br><br>true：默认值，开启智能改写。<br>false：关闭智能改写，使用原始提示词。 |
| | stream bool（可选） | 仅在图像混排模式（即 enable_interleave = true）下生效。<br><br>控制返回结果是否为流式输出。<br><br>false：默认值，非流式输出。<br>true：流式输出。 |
| | watermark bool（可选） | 是否添加水印标识，水印位于图片右下角，文案固定为“AI生成”。<br><br>false：默认值，不添加水印。<br>true：添加水印。 |
| | seed integer（可选） | 随机数种子，取值范围[0,2147483647]。<br><br>使用相同的seed参数值可使生成内容保持相对稳定。若不提供，算法将自动使用随机数种子。<br><br>**注意**：模型生成过程具有概率性，即使使用相同的seed，也不能保证每次生成结果完全一致。 |

### 响应参数
#### 任务执行成功
#### 任务执行成功（流式输出）
#### 任务执行异常
任务数据（如任务状态、图像URL等）仅保留24小时，超时后会被自动清除。请您务必及时保存生成的图像。

```json
{
    "output": {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "content": [
                        {
                            "image": "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/xxx.png?Expires=xxx",
                            "type": "image"
                        }
                    ],
                    "role": "assistant"
                }
            }
        ],
        "finished": true
    },
    "usage": {
        "image_count": 1,
        "input_tokens": 0,
        "output_tokens": 0,
        "size": "1280*1280",
        "total_tokens": 0
    },
    "request_id": "a3f4befe-cacd-49c9-8298-xxxxxx"
}
```

| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| output | object | 任务输出信息。 |
| | choices array of object | 模型生成的输出内容。 |
| | | finish_reason string：任务停止原因。<br>非流式输出场景：自然停止时为stop。<br>流式输出场景：当开启流式输出时，该参数判断数据流是否传输结束。<br>传输过程中：前序数据包会持续返回 "finish_reason": "null"，表示内容仍在生成中，请继续接收。<br>传输结束时：仅在最后一个 JSON 结构体中返回 "finish_reason":"stop"，表示流式请求已全部结束，应停止接收。 |
| | | message object：模型返回的消息。 |
| | | | role string：消息的角色，固定为assistant。 |
| | | | content array |
| | | | | type string：输出的类型，枚举值为text、image。 |
| | | | | text string：生成的文字。 |
| | | | | image string：生成图像的 URL，图像格式为PNG。<br>链接有效期为24小时，请及时下载并保存图像。 |
| | finished bool | 请求结束标志符。<br>true：表示请求结束。<br>false：表示请求未结束。 |
| usage | object | 输出信息统计。只对成功的结果计数。 |
| | image_count integer | 生成图像的张数。 |
| | size string | 生成的图像分辨率。示例值：1328*1328。 |
| | input_tokens integer | 输入token数量。按图片张数计费，当前固定为0。 |
| | output_tokens integer | 输出token数量。按图片张数计费，当前固定为0。 |
| | total_tokens integer | 总token数量。按图片张数计费，当前固定为0。 |
| request_id | string | 请求唯一标识。可用于请求明细溯源和问题排查。 |
| code | string | 请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。 |
| message | string | 请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。 |

---

## HTTP异步调用
由于图像生成任务耗时较长（通常为1-2分钟），API采用异步调用以避免请求超时。整个流程包含 “创建任务 -> 轮询获取” 两个核心步骤，具体如下：

具体耗时受限于排队任务数和服务执行情况，请在获取结果时耐心等待。

### 步骤1：创建任务获取任务ID
**北京地域**：POST https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation  
**新加坡地域**：POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/image-generation/generation

#### 说明
创建成功后，使用接口返回的 task_id 查询结果，task_id 有效期为 24 小时。请勿重复创建任务，轮询获取即可。

新手指引请参见Postman。

#### 请求参数
##### 图像编辑
##### 图文混排输出
```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation' \
--header 'Content-Type: application/json' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'X-DashScope-Async: enable' \
--data '{
    "model": "wan2.6-image",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "text": "参考图1的风格和图2的背景，生成番茄炒蛋"
                    },
                    {
                        "image": "https://cdn.wanx.aliyuncs.com/tmp/pressure/umbrella1.png"
                    },
                    {
                        "image": "https://img.alicdn.com/imgextra/i3/O1CN01SfG4J41UYn9WNt4X1_!!6000000002530-49-tps-1696-960.webp"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "prompt_extend": true,
        "watermark": false,
        "n": 1,
        "enable_interleave": false,
        "size": "1280*1280"
    }
}'
```

#### 请求头（Headers）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| Content-Type | string（必选） | 请求内容类型。此参数必须设置为application/json。 |
| Authorization | string（必选） | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |
| X-DashScope-Async | string（必选） | 异步处理配置参数。HTTP请求只支持异步，必须设置为enable。<br><br>**重要**<br>缺少此请求头将报错：“current user api does not support synchronous calls”。 |

#### 请求体（Request Body）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| model | string（必选） | 模型名称。<br>示例值：wan2.6-image。 |
| input | object（必选） | 输入的基本信息。 |
| | messages array（必选） | 请求内容数组。当前仅支持单轮对话，即传入一组role、content参数，不支持多轮对话。 |
| | | role string（必选）：消息的角色。此参数固定设置为user。 |
| | | content array（必选）：消息内容数组。 |
| | | | text string（必选）：正向提示词用于描述您期望生成的图像内容、风格和构图。<br><br>支持中英文，长度不超过2000个字符，每个汉字、字母、数字或符号计为一个字符，超过部分会自动截断。<br><br>示例值：参考这个风格的图片，生成番茄炒蛋。<br><br>**注意**：仅支持传入一个text，不传或传入多个将报错。 |
| | | | image string（可选）：输入图像的URL或Base64编码字符串。<br><br>**图像限制**：<br>图像格式：JPEG、JPG、PNG（不支持透明通道）、BMP、WEBP。<br>图像分辨率：图像的宽高范围均为[384, 5000]像素。<br>文件大小：不超过10MB。<br><br>**图像数量限制**：<br>输入图像数量与parameters.enable_interleave参数有关。<br>当enable_interleave=true时（图文混排输出），可输入0~1张图像。<br>当enable_interleave=false时（图像编辑），必须输入1~4张图像。<br>当输入多张图像时，需在content数组中传入多个image对象，并按照数组顺序定义图像顺序。<br><br>**支持的输入格式**：<br>1. 使用公网可访问URL<br>支持 HTTP 或 HTTPS 协议。<br>示例值：http://wanx.alicdn.com/material/xxx.jpeg。<br><br>2. 传入 Base64 编码图像后的字符串<br>格式：data:{MIME_type};base64,{base64_data}<br>示例：data:image/jpeg;base64,GDU7MtCZzEbTbmRZ...（仅示意，实际需传入完整字符串）<br><br>Base64 编码规范请参见图像传入方式。 |
| parameters | object（可选） | 图像处理参数。 |
| | negative_prompt string（可选） | 反向提示词，用于描述不希望在图像中出现的内容，对画面进行限制。<br><br>支持中英文，长度不超过500个字符，超出部分将自动截断。<br><br>示例值：低分辨率、错误、最差质量、低质量、残缺、多余的手指、比例不良等。 |
| | size string（可选） | 输出图像的分辨率，格式为宽*高。<br><br>wan2.6-image：总像素在 [768*768, 1280*1280] （即589824 至 1638400像素）之间，且宽高比范围为 [1:4, 4:1]。例如，768*2700符合要求。<br><br>示例值：1280*1280。<br><br>**常见比例推荐的分辨率**<br>1:1：1280*1280 或 1024*1024<br>2:3：800*1200<br>3:2：1200*800<br>3:4：960*1280<br>4:3：1280*960<br>9:16：720*1280<br>16:9：1280*720<br>21:9：1344*576<br><br>**输出图像尺寸的规则**<br>方式一：指定 size 参数：输出图像严格按 size 指定的宽高生成。<br><br>方式二：未指定 size：输出图像由 总像素上限 和 宽高比规则 共同决定。系统会根据总像素并按照宽高比规则对图像进行处理后输出。<br><br>**总像素规则**：由 enable_interleave 控制。<br>当 enable_interleave=true 时：<br>若输入图像总像素 ≤ 1280*1280，输出总像素与输入一致；<br>若输入图像总像素 > 1280*1280，输出总像素固定为 1280*1280。<br><br>当 enable_interleave=false 时：输出总像素固定为 1280*1280。<br><br>**宽高比规则（近似）**：<br>单图输入：输出宽高比与输入图像一致；<br>多图输入：输出宽高比与最后一张输入图像一致。<br><br>示例：当 enable_interleave=true 且输入 1 张 720*720 的图像时，输出图像为 720*720，宽高比与输入一致。 |
| | enable_interleave bool（可选） | 控制生图模式：<br><br>false：默认值，表示图像编辑模式（支持多图输入及主体一致性生成）。<br>用途：基于1～4张输入图像进行编辑、风格迁移或主体一致性生成。<br>输入：必须提供至少1张参考图像。<br>输出：可生成1至4张结果图像。<br><br>true ：表示启用图文混排输出模式（仅支持传入一张图像或不传图像）。<br>用途：根据文本描述生成图文并茂的内容，或进行纯文本生成图像（文生图）。<br>输入：可以不提供图像（文生图），或提供最多1张参考图像。<br>输出：固定生成1个包含文本和图像的混合内容块。 |
| | n integer（可选） | **重要**<br>n直接影响费用。费用 = 单价 × 成功生成的图片张数，请在调用前确认模型价格。<br><br>指定生成图片的数量。该参数的取值范围与含义取决于 enable_interleave（模式开关）的状态：<br><br>当 enable_interleave=false（图像编辑模式）：<br>作用：直接控制生成图像的数量。<br>取值范围：1～4，默认值为 4。<br>建议在测试阶段将此值设置为 1，以便低成本验证效果。<br><br>当 enable_interleave=true（图文混排模式）：<br>限制：此参数默认为1，且必须固定为1。若设置为其他值，接口将报错。<br>说明：在此模式下，如需控制生成图像的数量上限，请使用 max_images 参数。 |
| | max_images integer（可选） | **重要**<br>max_images影响费用。费用 = 单价 × 成功生成的图片张数，请在调用前确认模型价格。<br><br>仅在图文混排模式（即 enable_interleave=true）下生效。<br><br>作用：指定模型在单次回复中生成图像的最大数量。<br><br>取值范围：1～5，默认值为 5。<br><br>**注意**：该参数仅代表“数量上限”。实际生成的图像数量由模型推理决定，可能会少于设定值（例如：设置为 5，模型可能根据内容仅生成 3 张）。 |
| | prompt_extend bool（可选） | 仅在图像编辑模式（即enable_interleave = false）下生效。<br><br>是否开启 Prompt（提示词）智能改写功能。该功能仅对正向提示词进行优化与润色，不会改变反向提示词。<br><br>true：默认值，开启智能改写。<br>false：关闭智能改写，使用原始提示词。 |
| | watermark bool（可选） | 是否添加水印标识，水印位于图片右下角，文案固定为“AI生成”。<br><br>false：默认值，不添加水印。<br>true：添加水印。 |
| | seed integer（可选） | 随机数种子，取值范围[0,2147483647]。<br><br>使用相同的seed参数值可使生成内容保持相对稳定。若不提供，算法将自动使用随机数种子。<br><br>**注意**：模型生成过程具有概率性，即使使用相同的seed，也不能保证每次生成结果完全一致。 |

#### 响应参数
##### 成功响应
##### 异常响应
请保存 task_id，用于查询任务状态与结果。

```json
{
    "output": {
        "task_status": "PENDING",
        "task_id": "0385dc79-5ff8-4d82-bcb6-xxxxxx"
    },
    "request_id": "4909100c-7b5a-9f92-bfe5-xxxxxx"
}
```

| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| output | object | 任务输出信息。 |
| | task_id string | 任务ID。查询有效期24小时。 |
| | task_status string | 任务状态。<br>枚举值<br>PENDING：任务排队中<br>RUNNING：任务处理中<br>SUCCEEDED：任务执行成功<br>FAILED：任务执行失败<br>CANCELED：任务已取消<br>UNKNOWN：任务不存在或状态未知 |
| request_id | string | 请求唯一标识。可用于请求明细溯源和问题排查。 |
| code | string | 请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。 |
| message | string | 请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。 |

### 步骤2：根据任务ID查询结果
**北京地域**：GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}  
**新加坡地域**：GET https://dashscope-intl.aliyuncs.com/api/v1/tasks/{task_id}

#### 说明
- 轮询建议：图像生成过程约需数分钟，建议采用轮询机制，并设置合理的查询间隔（如 10 秒）来获取结果。
- 任务状态流转：PENDING（排队中）→ RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。
- 结果链接：任务成功后返回图像链接，有效期为 24 小时。建议在获取链接后立即下载并转存至永久存储（如阿里云 OSS）。
- QPS 限制：查询接口默认QPS为20。如需更高频查询或事件通知，建议配置异步任务回调。
- 更多操作：如需批量查询、取消任务等操作，请参见管理异步任务。

#### 请求参数
##### 查询任务结果
请将86ecf553-d340-4e21-xxxxxxxxx替换为真实的task_id。

```bash
curl -X GET https://dashscope.aliyuncs.com/api/v1/tasks/86ecf553-d340-4e21-xxxxxxxxx \
--header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

#### 请求头（Headers）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| Authorization | string（必选） | 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |

#### URL路径参数（Path parameters）
| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| task_id | string（必选） | 任务ID。 |

#### 响应参数
##### 任务执行成功
##### 任务执行异常
任务数据（如任务状态、图像URL等）仅保留24小时，超时后会被自动清除。请您务必及时保存生成的图像。

```json
{
    "request_id": "43d9e959-25bc-4dc7-9888-xxxxxx",
    "output": {
        "task_id": "858cad55-4bdc-4ba3-ae6c-xxxxxx",
        "task_status": "SUCCEEDED",
        "submit_time": "2025-12-16 04:21:02.275",
        "scheduled_time": "2025-12-16 04:21:02.304",
        "end_time": "2025-12-16 04:24:46.658",
        "finished": true,
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "image": "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/1xxx.png?Expires=xxx",
                            "type": "image"
                        }
                    ]
                }
            },
            {
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "image": "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/1xxx.png?Expires=xxx",
                            "type": "image"
                        }
                    ]
                }
            }
        ]
    },
    "usage": {
        "size": "1280*1280",
        "total_tokens": 0,
        "image_count": 2,
        "output_tokens": 0,
        "input_tokens": 0
    }
}
```

| 参数名 | 类型 | 说明 |
|-------|-----|-----|
| output | object | 任务输出信息。 |
| | task_id string | 任务ID。查询有效期24小时。 |
| | task_status string | 任务状态。<br>枚举值<br>PENDING：任务排队中<br>RUNNING：任务处理中<br>SUCCEEDED：任务执行成功<br>FAILED：任务执行失败<br>CANCELED：任务已取消<br>UNKNOWN：任务不存在或状态未知<br><br>轮询过程中的状态流转：<br>PENDING（排队中） → RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。<br>初次查询状态通常为 PENDING（排队中）或 RUNNING（处理中）。<br>当状态变为 SUCCEEDED 时，响应中将包含生成的图像url。<br>若状态为 FAILED，请检查错误信息并重试。 |
| | submit_time string | 任务提交时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 |
| | scheduled_time string | 任务执行时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 |
| | end_time string | 任务完成时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 |
| | finished bool | 请求结束标志符。<br>true：表示请求结束。<br>false：表示请求未结束。 |
| | choices array of object | 模型生成的输出内容。 |
| | | finish_reason string：任务停止原因，自然停止时为stop。 |
| | | message object：模型返回的消息。 |
| | | | role string：消息的角色，固定为assistant。 |
| | | | content array |
| | | | | type string：输出的类型，枚举值为text、image。 |
| | | | | text string：生成的文字。 |
| | | | | image string：生成图像的 URL，图像格式为PNG。<br>链接有效期为24小时，请及时下载并保存图像。 |
| usage | object | 输出信息统计。只对成功的结果计数。 |
| | image_count integer | 生成图像的张数。 |
| | size string | 生成的图像分辨率。示例值：1328*1328。 |
| | input_tokens integer | 输入token数量。按图片张数计费，当前固定为0。 |
| | output_tokens integer | 输出token数量。按图片张数计费，当前固定为0。 |
| | total_tokens integer | 总token数量。按图片张数计费，当前固定为0。 |
| request_id | string | 请求唯一标识。可用于请求明细溯源和问题排查。 |
| code | string | 请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。 |
| message | string | 请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。 |

---

## 使用限制
1. 数据时效：任务task_id和 图像url均只保留 24 小时，过期后将无法查询或下载。
2. 内容审核：输入的 prompt 和输出的图像均会经过内容安全审核，包含违规内容的请求将报错“IPInfringementSuspect”或“DataInspectionFailed”，具体参见错误信息。
3. 网络访问配置：图像链接存储于阿里云 OSS，如果业务系统因安全策略无法访问外部OSS链接，请将以下 OSS 域名加入网络访问白名单。

```
# OSS域名列表
dashscope-result-bj.oss-cn-beijing.aliyuncs.com
dashscope-result-hz.oss-cn-hangzhou.aliyuncs.com
dashscope-result-sh.oss-cn-shanghai.aliyuncs.com
dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com
dashscope-result-zjk.oss-cn-zhangjiakou.aliyuncs.com
dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com
dashscope-result-hy.oss-cn-heyuan.aliyuncs.com
dashscope-result-cd.oss-cn-chengdu.aliyuncs.com
dashscope-result-gz.oss-cn-guangzhou.aliyuncs.com
dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com
```

---

## 计费与限流
模型免费额度和计费单价请参见模型价格。

模型限流请参见通义万相。

### 计费说明：
1. 按成功生成的 图像张数 计费。仅当查询结果接口返回task_status为SUCCEEDED 并成功生成图像后，才会计费。
2. 模型调用失败或处理错误不产生任何费用，也不消耗免费额度。

---

## 错误码
如果模型调用失败并返回报错信息，请参见错误信息进行解决。


# 通义万相-通用图像编辑2.5 API参考
更新时间：2025-12-05 15:52:08

## 核心需求确认
你需要我整理通义万相-通用图像编辑2.5（wan2.5-i2i-preview）的完整API参考，包括模型能力、调用方式（HTTP异步调用、SDK调用）、参数说明、使用限制等核心内容，使其结构清晰、可直接参考使用。

---

## 一、模型概览
### 1.1 核心能力
该模型仅需文本指令，即可基于单张或多张参考图像实现**主体一致的图像编辑、多图融合**，核心功能示例如下：

| 功能类型 | 输入示例 | 输出效果 |
|----------|----------|----------|
| 单图编辑 | 参考图：花卉连衣裙人像<br>指令：将花卉连衣裙换成一件复古风格的蕾丝长裙，领口和袖口有精致的刺绣细节 | 保持人物主体不变，连衣裙替换为指定风格 |
| 多图融合 | 参考图1：闹钟<br>参考图2：餐桌<br>指令：将图1中的闹钟放置到图2的餐桌的花瓶旁边位置 | 实现多图元素融合，闹钟出现在指定位置 |

### 1.2 模型基础信息
| 模型名称 | 模型简介 | 输出图像规格 |
|----------|----------|--------------|
| wan2.5-i2i-preview | 万相2.5 preview<br>支持单图编辑、多图融合 | 图片格式：PNG<br>分辨率规则：<br>1. 指定`size`：宽*高，总像素[768*768, 1280*1280]，宽高比[1:4, 4:1]<br>2. 未指定`size`：默认总像素1280*1280，单图输入宽高比与原图一致，多图输入与最后一张图一致 |

### 1.3 前提条件
1. 需先获取并配置阿里云百炼API Key（配置到环境变量或直接传入代码）；
2. **重要**：北京/新加坡地域有独立API Key和请求地址，不可混用，跨地域调用会鉴权失败/报错。

---

## 二、HTTP异步调用（核心方式）
图像编辑任务耗时1-2分钟，API仅支持异步调用，流程为「创建任务（获取task_id）→ 轮询查询结果」。

### 步骤1：创建任务（获取task_id）
#### 请求地址
- 北京地域：`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis`
- 新加坡地域：`POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis`

#### 请求示例（curl）
```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.5-i2i-preview",
    "input": {
        "prompt": "将花卉连衣裙换成一件复古风格的蕾丝长裙，领口和袖口有精致的刺绣细节。",
        "images": [
            "https://img.alicdn.com/imgextra/i2/O1CN01vHOj4h28jOxUJPwY8_!!6000000007968-49-tps-1344-896.webp"
        ],
        "negative_prompt": "低分辨率、模糊、比例失调"
    },
    "parameters": {
        "prompt_extend": true,
        "n": 1,
        "size": "1280*1280",
        "watermark": false,
        "seed": 12345
    }
}'
```

#### 请求头（Headers）
| 参数名 | 类型 | 必选 | 说明 |
|--------|------|------|------|
| Content-Type | string | 是 | 固定为`application/json` |
| Authorization | string | 是 | Bearer + API Key，示例：`Bearer sk-xxxx` |
| X-DashScope-Async | string | 是 | 固定为`enable`，缺失会报错「不支持同步调用」 |

#### 请求体（Request Body）
| 层级 | 参数名 | 类型 | 必选 | 核心说明 |
|------|--------|------|------|----------|
| 根级 | model | string | 是 | 固定为`wan2.5-i2i-preview` |
| 根级 | input | object | 是 | 输入信息体 |
| input | prompt | string | 是 | 正向提示词，描述编辑需求，长度≤2000字符 |
| input | images | array[string] | 是 | 参考图URL/Base64数组，最多3张；支持公网URL、Base64（格式：data:{MIME};base64,xxx） |
| input | negative_prompt | string | 否 | 反向提示词，描述不希望出现的内容，长度≤500字符 |
| 根级 | parameters | object | 否 | 处理参数 |
| parameters | size | string | 否 | 输出分辨率，默认1280*1280，如`1280*1280`、`720*1280` |
| parameters | n | integer | 否 | 生成图片数量，1~4张，默认4（测试建议设1控成本） |
| parameters | watermark | boolean | 否 | 是否加「AI生成」水印，默认false |
| parameters | prompt_extend | boolean | 否 | 是否开启提示词智能改写，默认true（提升效果但增加耗时） |
| parameters | seed | integer | 否 | 随机种子[0,2147483647]，固定种子可提升结果稳定性 |

#### 成功响应（获取task_id）
```json
{
    "output": {
        "task_status": "PENDING",
        "task_id": "0385dc79-5ff8-4d82-bcb6-xxxxxx"
    },
    "request_id": "4909100c-7b5a-9f92-bfe5-xxxxxx"
}
```
- `task_id`：查询结果的核心标识，有效期24小时；
- `task_status`：初始状态为PENDING（排队中），后续流转为RUNNING→SUCCEEDED/FAILED。

### 步骤2：根据task_id查询结果
#### 请求地址
- 北京地域：`GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}`
- 新加坡地域：`GET https://dashscope-intl.aliyuncs.com/api/v1/tasks/{task_id}`

#### 请求示例（curl）
```bash
curl -X GET https://dashscope.aliyuncs.com/api/v1/tasks/86ecf553-d340-4e21-xxxxxxxxx \
--header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

#### 成功响应（任务完成）
```json
{
    "request_id": "d1f2a1be-9c58-48af-b43f-xxxxxx",
    "output": {
        "task_id": "7f4836cd-1c47-41b3-b3a4-xxxxxx",
        "task_status": "SUCCEEDED",
        "submit_time": "2025-09-23 22:14:10.800",
        "end_time": "2025-09-23 22:15:23.456",
        "results": [
            {
                "orig_prompt": "将花卉连衣裙换成复古蕾丝长裙",
                "actual_prompt": "优化后的提示词（开启prompt_extend才返回）",
                "url": "https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/xxx.png?Expires=xxx"
            }
        ],
        "task_metrics": {
            "TOTAL": 1,
            "SUCCEEDED": 1,
            "FAILED": 0
        }
    },
    "usage": {
        "image_count": 1
    }
}
```
- 关键字段：`task_status=SUCCEEDED`表示成功，`results[0].url`为生成图链接（有效期24小时，需及时下载）。

---

## 三、DashScope SDK调用（更便捷）
SDK封装了异步流程，支持Python/Java，推荐使用（需确保版本达标：Python≥1.25.2、Java≥2.22.2）。

### 3.1 Python SDK调用（完整示例）
```python
import base64
import mimetypes
from http import HTTPStatus
from urllib.parse import urlparse, unquote
from pathlib import PurePosixPath
import dashscope
import requests
from dashscope import ImageSynthesis
import os

# 1. 配置地域和API Key
dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'  # 北京地域；新加坡替换为dashscope-intl.aliyuncs.com
api_key = os.getenv("DASHSCOPE_API_KEY")  # 或直接赋值：api_key="sk-xxx"

# 2. Base64编码工具函数（可选）
def encode_file(file_path):
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type or not mime_type.startswith("image/"):
        raise ValueError("不支持的图像格式")
    with open(file_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode('utf-8')
    return f"data:{mime_type};base64,{encoded}"

# 3. 选择图像输入方式（三选一）
## 方式1：公网URL
image1 = "https://img.alicdn.com/imgextra/i3/O1CN0157XGE51l6iL9441yX_!!6000000004770-49-tps-1104-1472.webp"
image2 = "https://img.alicdn.com/imgextra/i3/O1CN01SfG4J41UYn9WNt4X1_!!6000000002530-49-tps-1696-960.webp"
## 方式2：本地文件（file://+路径）
# image1 = "file://./test1.png"
## 方式3：Base64编码
# image1 = encode_file("./test1.png")

# 4. 同步调用（SDK自动处理异步轮询）
print('----开始调用，等待结果----')
rsp = ImageSynthesis.call(
    api_key=api_key,
    model="wan2.5-i2i-preview",
    prompt="将图1中的闹钟放置到图2的餐桌的花瓶旁边位置",
    images=[image1, image2],  # 多图融合传2张，单图编辑传1张
    negative_prompt="低分辨率、模糊",
    n=1,  # 生成1张图
    size="1280*1280",
    prompt_extend=True,
    watermark=False,
    seed=12345
)

# 5. 处理结果（下载图片）
if rsp.status_code == HTTPStatus.OK:
    for result in rsp.output.results:
        # 解析文件名并下载
        file_name = PurePosixPath(unquote(urlparse(result.url).path)).parts[-1]
        with open(f'./{file_name}', 'wb+') as f:
            f.write(requests.get(result.url).content)
    print("图片下载完成！")
else:
    print(f"调用失败：{rsp.status_code} - {rsp.message}")
```

### 3.2 Java SDK调用（核心示例）
```java
import com.alibaba.dashscope.aigc.imagesynthesis.*;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.utils.Constants;
import java.util.*;

public class ImageEditDemo {
    static {
        // 配置地域
        Constants.baseHttpApiUrl = "https://dashscope.aliyuncs.com/api/v1";
    }
    // 配置API Key
    static String apiKey = System.getenv("DASHSCOPE_API_KEY");

    public static void main(String[] args) {
        // 1. 准备图像列表（公网URL示例）
        List<String> images = new ArrayList<>();
        images.add("https://img.alicdn.com/imgextra/i3/O1CN0157XGE51l6iL9441yX_!!6000000004770-49-tps-1104-1472.webp");
        images.add("https://img.alicdn.com/imgextra/i3/O1CN01SfG4J41UYn9WNt4X1_!!6000000002530-49-tps-1696-960.webp");

        // 2. 配置参数
        Map<String, Object> parameters = new HashMap<>();
        parameters.put("prompt_extend", true);
        parameters.put("watermark", false);
        parameters.put("seed", 12345);

        // 3. 构建请求参数
        ImageSynthesisParam param = ImageSynthesisParam.builder()
                .apiKey(apiKey)
                .model("wan2.5-i2i-preview")
                .prompt("将图1中的闹钟放置到图2的餐桌的花瓶旁边位置")
                .images(images)
                .n(1)
                .negativePrompt("低分辨率、模糊")
                .parameters(parameters)
                .build();

        // 4. 同步调用
        ImageSynthesis synthesis = new ImageSynthesis();
        try {
            ImageSynthesisResult result = synthesis.call(param);
            System.out.println("生成结果：" + result);
            // 解析URL并下载（略）
        } catch (ApiException e) {
            System.err.println("调用失败：" + e.getMessage());
        }
    }
}
```

---

## 四、使用限制
1. **数据时效**：task_id和生成图URL仅保留24小时，过期无法查询/下载；
2. **内容审核**：输入prompt、参考图、输出图都会审核，违规会报「IPInfringementSuspect」/「DataInspectionFailed」；
3. **网络配置**：若业务系统无法访问OSS，需将以下域名加入白名单：
   ```
   dashscope-result-bj.oss-cn-beijing.aliyuncs.com
   dashscope-result-sh.oss-cn-shanghai.aliyuncs.com
   # 其他地域域名见文档
   ```
4. **计费规则**：按成功生成的图片数量计费（n=4则按4张收费），调用失败不扣费。

---

## 五、常见问题
1. **Q**：从2.1版本切换到2.5，SDK调用需要调整吗？
   **A**：需要。2.5仅需传入prompt（文本描述编辑需求），不再需要function参数；
2. **Q**：如何查看调用量？
   **A**：调用1小时后，在阿里云模型观测页面查看调用次数、成功率等指标；
3. **Q**：相同seed为什么结果不一致？
   **A**：模型生成有概率性，seed仅提升稳定性，无法保证完全一致。

---



