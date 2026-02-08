# 文生视频
**请求方式**：POST
**接口地址**：`https://api.vidu.cn/ent/v2/text2video`

---

## 请求头
| 字段 | 值 | 描述 |
| ---- | ---- | ---- |
| Content-Type | application/json | 数据交换格式 |
| Authorization | Token {your api key} | 将 `{your api key}` 替换为您的 token |

---

## 请求体
| 参数名称 | 类型 | 必填 | 参数描述 |
| -------- | ---- | ---- | -------- |
| model | String | 是 | 模型名称<br>可选值：`viduq3-pro`、`viduq2`、`viduq1`<br>- `viduq3-pro`：高效生成优质音视频内容，视频更生动、形象、立体<br>- `viduq2`：最新模型<br>- `viduq1`：画面清晰，平滑转场，运镜稳定 |
| style | String | 可选 | 风格<br>默认 `general`，可选值：`general`、`anime`<br>- `general`：通用风格，可通过提示词控制<br>- `anime`：动漫风格，仅动漫场景表现突出<br>**注**：使用 q2、q3 模型时该参数不生效 |
| prompt | String | 是 | 文本提示词，视频描述文本<br>**注**：字符长度 ≤ 2000 |
| duration | Int | 可选 | 视频时长（默认依模型而定）<br>- `viduq3-pro`：默认 5 秒，可选 1–16<br>- `viduq2`：默认 5 秒，可选 1–10<br>- `viduq1`：默认 5 秒，仅可选 5 |
| seed | Int | 可选 | 随机种子<br>不传/传 0 则使用随机数；手动传参则固定种子 |
| aspect_ratio | String | 可选 | 画面比例<br>默认 `16:9`，可选：`16:9`、`9:16`、`3:4`、`4:3`、`1:1`<br>**注**：`3:4`、`4:3` 仅支持 q2、q3 模型 |
| resolution | String | 可选 | 分辨率（默认依模型+时长而定）<br>- `viduq3-pro(1-16s)`：默认 720p，可选 540p/720p/1080p<br>- `viduq2(1-10s)`：默认 720p，可选 540p/720p/1080p<br>- `viduq1(5s)`：默认 1080p，仅可选 1080p |
| movement_amplitude | String | 可选 | 运动幅度<br>默认 `auto`，可选：`auto`/`small`/`medium`/`large`<br>**注**：q2、q3 模型不生效 |
| bgm | Bool | 可选 | 是否添加背景音乐<br>默认 `false`，可选 `true`/`false`<br>- `true`：系统从库中自动匹配 BGM<br>- `false`：无 BGM<br>**注**：q2(duration=9/10s)、q3 模型不生效 |
| audio | Bool | 可选 | 音视频直出能力，默认 `true`<br>- `false`：输出静音视频<br>- `true`：音画同步（含台词、音效）<br>**注**：仅 q3 模型支持 |
| payload | String | 可选 | 透传参数，不做处理，仅传输<br>**注**：最大 1048576 字符 |
| off_peak | Bool | 可选 | 错峰模式，默认 `false`<br>- `true`：错峰生成（积分更低）<br>- `false`：即时生成<br>**注1**：错峰任务 48h 内完成，超时自动取消并退积分<br>**注2**：支持手动取消错峰任务 |
| watermark | Bool | 可选 | 是否添加水印<br>- `true`：添加<br>- `false`：不添加（默认）<br>**注**：水印内容固定为「内容由AI生成」 |
| wm_position | Int | 可选 | 水印位置，默认 3<br>1：左上角 / 2：右上角 / 3：右下角 / 4：左下角 |
| wm_url | String | 可选 | 水印图片 URL，不传则使用默认水印 |
| meta_data | String | 可选 | 元数据标识（JSON 字符串），自定义透传字段，为空则使用平台默认 |
| callback_url | String | 可选 | 回调地址（POST），任务状态变更时推送结果<br>回调 `status`：`processing`/`success`/`failed`<br>失败自动重试 3 次，签名算法见官方文档 |

---

## 请求示例（curl）
```bash
curl -X POST -H "Authorization: Token {your_api_key}" -H "Content-Type: application/json" -d '
{
    "model": "viduq3-pro",
    "style": "general",
    "prompt": "In an ultra-realistic fashion photography style featuring light blue and pale amber tones, an astronaut in a spacesuit walks through the fog. The background consists of enchanting white and golden lights, creating a minimalist still life and an impressive panoramic scene.",
    "duration": 5,
    "seed": 0,
    "aspect_ratio": "4:3",
    "resolution": "540p",
    "movement_amplitude": "auto",
    "off_peak": false
}' https://api.vidu.cn/ent/v2/text2video
```

---

## 响应体
| 字段 | 类型 | 描述 |
| ---- | ---- | ---- |
| task_id | String | 平台生成的任务 ID |
| state | String | 处理状态<br>可选值：`created`/`queueing`/`processing`/`success`/`failed` |
| model | String | 本次调用模型 |
| prompt | String | 本次提示词 |
| duration | Int | 本次视频时长 |
| seed | Int | 本次随机种子 |
| aspect_ratio | String | 本次画面比例 |
| resolution | String | 本次分辨率 |
| bgm | Bool | 本次是否开启 BGM |
| movement_amplitude | String | 本次运动幅度 |
| payload | String | 透传参数 |
| off_peak | Bool | 是否错峰模式 |
| credits | Int | 本次消耗积分 |
| watermark | Bool | 是否开启水印 |
| created_at | String | 任务创建时间 |

---

## 响应示例
```json
{
  "task_id": "your_task_id_here",
  "state": "created",
  "model": "viduq3-pro",
  "style": "general",
  "prompt": "In an ultra-realistic fashion photography style featuring light blue and pale amber tones, an astronaut in a spacesuit walks through the fog. The background consists of enchanting white and golden lights, creating a minimalist still life and an impressive panoramic scene.",
  "duration": 5,
  "seed": random_number,
  "aspect_ratio": "4:3",
  "resolution": "540p",
  "movement_amplitude": "auto",
  "payload": "",
  "off_peak": false,
  "credits": credits_number,
  "created_at": "2025-01-01T15:41:31.968916Z"
}
```

# 图生视频
**请求方式**：POST
**接口地址**：`https://api.vidu.cn/ent/v2/img2video`

---

## 请求头
| 字段 | 值 | 描述 |
| ---- | ---- | ---- |
| Content-Type | application/json | 数据交换格式 |
| Authorization | Token {your api key} | 将 `{your api key}` 替换为您的 token |

---

## 请求体
| 参数名称 | 类型 | 必填 | 参数描述 |
| -------- | ---- | ---- | -------- |
| model | String | 是 | 模型名称<br>可选值：`viduq3-pro`、`viduq2-pro-fast`、`viduq2-pro`、`viduq2-turbo`、`viduq1`、`viduq1-classic`、`vidu2.0`<br>- `viduq3-pro`：高效生成优质音视频内容，视频更生动、形象、立体<br>- `viduq2-pro-fast`：价格触底、效果稳定，生成速度较 `viduq2-turbo` 提高 2–3 倍<br>- `viduq2-pro`：新模型，效果好，细节丰富<br>- `viduq2-turbo`：新模型，效果好，生成快<br>- `viduq1`：画面清晰，平滑转场，运镜稳定<br>- `viduq1-classic`：画面清晰，转场、运镜更丰富<br>- `vidu2.0`：生成速度快 |
| images | Array[String] | 是 | 首帧图像，以此为首帧生成视频<br>注1：支持图片 Base64 编码或可访问 URL<br>注2：仅支持传入 **1 张图**<br>注3：格式支持 `png`/`jpeg`/`jpg`/`webp`<br>注4：图片比例需小于 `1:4` 或 `4:1`<br>注5：单图大小 ≤ 50 MB<br>注6：HTTP POST body ≤ 20MB，Base64 需带前缀，如 `data:image/png;base64,{base64_encode}` |
| prompt | String | 可选 | 视频文本描述<br>注1：长度 ≤ 2000 字符<br>注2：若 `is_rec=true`，此参数不生效 |
| audio | Bool | 可选 | 音视频直出能力，默认 `false`；`model=q3` 时默认 `true`<br>- `false`：输出静音视频<br>- `true`：输出带台词、背景音的视频<br>注1：为 `true` 时 `voice_id` 才生效<br>注2：为 `true` 时仅 q3 模型支持错峰 |
| voice_id | String | 可选 | 音色 ID（q3 模型不生效），为空则系统自动推荐；可使用声音复刻 API 互通 ID |
| is_rec | Bool | 可选 | 是否使用系统推荐提示词<br>- `true`：系统自动推荐（数量=1），忽略 `prompt`<br>- `false`：使用自定义 `prompt`<br>注：启用后每个任务多消耗 10 积分 |
| bgm | Bool | 可选 | 是否添加背景音乐，默认 `false`<br>- `true`：系统从库自动挑选适配音乐<br>- `false`：不添加 BGM<br>注：q2 模型 `duration=9/10s`、q3 模型不生效 |
| duration | Int | 可选 | 视频时长（默认/可选范围）<br>- `viduq3-pro`：默认 5，可选 1–16<br>- `viduq2-pro-fast`：默认 5，可选 1–10<br>- `viduq2-pro`：默认 5，可选 1–10<br>- `viduq2-turbo`：默认 5，可选 1–10<br>- `viduq1`：默认 5，仅可选 5<br>- `viduq1-classic`：默认 5，仅可选 5<br>- `vidu2.0`：默认 4，可选 4/8 |
| seed | Int | 可选 | 随机种子；不传/传 0 则随机，手动传参则固定 |
| resolution | String | 可选 | 分辨率（默认依模型+时长而定）<br>- `viduq3-pro(1-16s)`：默认 720p，可选 540p/720p/1080p<br>- `viduq2-pro-fast(1-10s)`：默认 720p，可选 720p/1080p<br>- `viduq2-pro(1-10s)`：默认 720p，可选 540p/720p/1080p<br>- `viduq2-turbo(1-10s)`：默认 720p，可选 540p/720p/1080p<br>- `viduq1(5s)`：默认 1080p，仅可选 1080p<br>- `viduq1-classic(5s)`：默认 1080p，仅可选 1080p<br>- `vidu2.0(4s)`：默认 360p，可选 360p/720p/1080p<br>- `vidu2.0(8s)`：默认 720p，仅可选 720p |
| movement_amplitude | String | 可选 | 运动幅度，默认 `auto`，可选 `auto`/`small`/`medium`/`large`<br>注：q2、q3 模型不生效 |
| payload | String | 可选 | 透传参数，仅传输不处理，最大 1048576 字符 |
| off_peak | Bool | 可选 | 错峰模式，默认 `false`<br>- `true`：错峰生成（积分更低）<br>- `false`：即时生成<br>注1：错峰任务 48h 内完成，超时自动取消并退积分<br>注2：支持手动取消错峰任务<br>注3：非 q3 音视频直出不支持错峰 |
| watermark | Bool | 可选 | 是否添加水印，默认 `false`<br>- `true`：添加（固定内容：内容由AI生成）<br>- `false`：不添加 |
| wm_position | Int | 可选 | 水印位置，默认 3<br>1：左上角 / 2：右上角 / 3：右下角 / 4：左下角 |
| wm_url | String | 可选 | 水印图片 URL，不传则使用默认水印 |
| meta_data | String | 可选 | 元数据标识（JSON 字符串），透传字段；为空则使用平台默认 |
| callback_url | String | 可选 | 回调地址（POST），任务状态变更时推送<br>回调 `status`：`processing`/`success`/`failed`<br>失败自动重试 3 次，签名算法见官方文档 |

---

## 请求示例（curl）
```bash
curl -X POST -H "Authorization: Token {your_api_key}" -H "Content-Type: application/json" -d '
{
    "model": "viduq3-pro",
    "images": ["https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/image2video.png"],
    "prompt": "The astronaut waved and the camera moved up.",
    "audio": true,
    "voice_id": "professional_host",
    "duration": 5,
    "seed": 0,
    "resolution": "1080p",
    "movement_amplitude": "auto",
    "off_peak": false
}' https://api.vidu.cn/ent/v2/img2video
```

---

## 响应体
| 字段 | 类型 | 描述 |
| ---- | ---- | ---- |
| task_id | String | 平台生成的任务 ID |
| state | String | 处理状态：`created`/`queueing`/`processing`/`success`/`failed` |
| model | String | 本次调用模型 |
| prompt | String | 本次提示词 |
| images | Array[String] | 本次传入的首帧图像参数 |
| duration | Int | 本次视频时长 |
| seed | Int | 本次随机种子 |
| resolution | String | 本次分辨率 |
| movement_amplitude | String | 本次运动幅度 |
| payload | String | 透传参数 |
| off_peak | Bool | 是否错峰模式 |
| credits | Int | 本次消耗积分 |
| watermark | Bool | 是否开启水印 |
| created_at | String | 任务创建时间 |

---

## 响应示例
```json
{
  "task_id": "your_task_id_here",
  "state": "created",
  "model": "viduq3-pro",
  "images": ["https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/image2video.png"],
  "prompt": "The astronaut waved and the camera moved up.",
  "duration": 5,
  "seed": random_number,
  "resolution": "1080p",
  "movement_amplitude": "auto",
  "payload": "",
  "off_peak": false,
  "credits": credits_number,
  "created_at": "2025-01-01T15:41:31.968916Z"
}
```

# 首尾帧
**请求方式**：POST  
**接口地址**：`https://api.vidu.cn/ent/v2/start-end2video`

---

## 请求头
| 字段 | 值 | 描述 |
| ---- | ---- | ---- |
| Content-Type | application/json | 数据交换格式 |
| Authorization | Token {your api key} | 将 `{your api key}` 替换为您的 token |

---

## 请求体
| 参数名称 | 类型 | 必填 | 参数描述 |
| -------- | ---- | ---- | -------- |
| model | String | 是 | 模型名称<br>可选值：`viduq2-pro-fast`、`viduq2-pro`、`viduq2-turbo`、`viduq1`、`viduq1-classic`、`vidu2.0`<br>- `viduq2-pro-fast`：价格触底、效果稳定，速度较 `viduq2-turbo` 提高 2–3 倍<br>- `viduq2-pro`：新模型，效果好、细节丰富<br>- `viduq2-turbo`：新模型，效果好、生成快<br>- `viduq1`：画面清晰，平滑转场，运镜稳定<br>- `viduq1-classic`：画面清晰，转场、运镜更丰富<br>- `vidu2.0`：生成速度快 |
| images | Array[String] | 是 | 首尾帧图像（第一张=首帧，第二张=尾帧）<br>注1：首尾帧分辨率比值需在 0.8～1.25 之间；比例需小于 1:4 或 4:1<br>注2：支持 Base64 编码或可访问 URL<br>注3：格式：`png`/`jpeg`/`jpg`/`webp`<br>注4：单图 ≤ 50 MB<br>注5：POST body ≤ 20MB，Base64 需带前缀：`data:image/png;base64,{...}` |
| prompt | String | 可选 | 视频文本描述<br>注1：长度 ≤ 2000 字符<br>注2：`is_rec=true` 时此参数不生效 |
| is_rec | Bool | 可选 | 是否使用系统推荐提示词<br>- `true`：系统自动推荐（数量=1），忽略 `prompt`<br>- `false`：使用自定义 `prompt`<br>注：启用后多消耗 10 积分 |
| duration | Int | 可选 | 视频时长（默认/可选）<br>- `viduq2-pro-fast`：默认 5，可选 1–8<br>- `viduq2-pro`：默认 5，可选 1–8<br>- `viduq2-turbo`：默认 5，可选 1–8<br>- `viduq1`/`viduq1-classic`：默认 5，仅可选 5<br>- `vidu2.0`：默认 4，可选 4/8 |
| seed | Int | 可选 | 随机种子；不传/传 0 则随机，手动传参则固定 |
| resolution | String | 可选 | 分辨率（依模型+时长而定）<br>- `viduq2-pro-fast(1-8s)`：默认 720p，可选 720p/1080p<br>- `viduq2-pro(1-8s)`：默认 720p，可选 540p/720p/1080p<br>- `viduq2-turbo(1-8s)`：默认 720p，可选 540p/720p/1080p<br>- `viduq1`/`viduq1-classic(5s)`：默认 1080p，仅可选 1080p<br>- `vidu2.0(4s)`：默认 360p，可选 360p/720p/1080p<br>- `vidu2.0(8s)`：默认 720p，仅可选 720p |
| movement_amplitude | String | 可选 | 运动幅度，默认 `auto`，可选：`auto`/`small`/`medium`/`large` |
| bgm | Bool | 可选 | 是否添加背景音乐，默认 `false`<br>- `true`：系统自动挑选并适配<br>- `false`：不添加<br>注：q2 模型 `duration=9/10s` 不生效 |
| payload | String | 可选 | 透传参数，仅传输不处理，最大 1048576 字符 |
| off_peak | Bool | 可选 | 错峰模式，默认 `false`<br>- `true`：错峰生成（积分更低）<br>- `false`：即时生成<br>注1：48 小时内完成，超时自动取消并退积分<br>注2：支持手动取消 |
| watermark | Bool | 可选 | 是否添加水印，默认 `false`<br>- `true`：添加（内容：由AI生成）<br>- `false`：不添加 |
| wm_position | Int | 可选 | 水印位置，默认 3<br>1：左上角 / 2：右上角 / 3：右下角 / 4：左下角 |
| wm_url | String | 可选 | 水印图片 URL，不传则使用默认水印 |
| meta_data | String | 可选 | 元数据标识（JSON 字符串），透传字段；为空则使用平台默认 |
| callback_url | String | 可选 | 回调地址（POST），状态变更时推送<br>回调 `status`：`processing`/`success`/`failed`<br>失败自动重试 3 次，签名算法见官方文档 |

---

## 请求示例（curl）
```bash
curl -X POST -H "Authorization: Token {your_api_key}" -H "Content-Type: application/json" -d '
{
    "model": "viduq2-pro",
    "images": [
        "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/startend2video-1.jpeg",
        "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/startend2video-2.jpeg"
    ],
    "prompt": "The camera zooms in on the bird, which then flies to the right. With its flight being smooth and natural, the bird soars in the sky. with a red light effect following and surrounding it from behind.",
    "duration": 5,
    "seed": 0,
    "resolution": "1080p",
    "movement_amplitude": "auto",
    "off_peak": false
}' https://api.vidu.cn/ent/v2/start-end2video
```

---

## 响应体
| 字段 | 类型 | 描述 |
| ---- | ---- | ---- |
| task_id | String | 平台生成的任务 ID |
| state | String | 处理状态：`created`/`queueing`/`processing`/`success`/`failed` |
| model | String | 本次调用模型 |
| prompt | String | 本次提示词 |
| images | Array[String] | 本次传入的首尾帧图像 |
| duration | Int | 本次视频时长 |
| seed | Int | 本次随机种子 |
| resolution | String | 本次分辨率 |
| bgm | Bool | 本次是否开启背景音乐 |
| movement_amplitude | String | 本次运动幅度 |
| payload | String | 透传参数 |
| off_peak | Bool | 是否错峰模式 |
| credits | Int | 本次消耗积分 |
| watermark | Bool | 是否开启水印 |
| created_at | String | 任务创建时间 |

---

## 响应示例
```json
{
  "task_id": "your_task_id_here",
  "state": "created",
  "model": "viduq2-turbo",
  "images": [
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/startend2video-1.jpeg",
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/startend2video-2.jpeg"
  ],
  "prompt": "The camera zooms in on the bird, which then flies to the right. The bird's flight is smooth and natural, with a red light effect following and surrounding it from behind.",
  "duration": 5,
  "seed": random_number,
  "resolution": "1080p",
  "movement_amplitude": "auto",
  "payload": "",
  "off_peak": false,
  "credits": credits_number,
  "created_at": "2025-01-01T15:41:31.968916Z"
}
```

# 参考生视频
参考生视频分为**音视频直出**、**视频直出**功能，二者使用相同接口地址与请求方式，仅请求体不同；`viduq2-pro` 模型目前仅支持非主体调用。

- **音视频直出**：指定视频主体台词对话，直接生成完整音视频
- **视频直出**：为场景配置背景音乐，不含台词

**请求方式**：POST
**接口地址**：`https://api.vidu.cn/ent/v2/reference2video`

---

## 请求头
| 字段 | 值 | 描述 |
| ---- | ---- | ---- |
| Content-Type | application/json | 数据交换格式 |
| Authorization | Token {your api key} | 将 `{your api key}` 替换为您的 token |

---

# 一、主体调用（音视频直出）
## 请求体
| 参数名称 | 子参数 | 类型 | 必填 | 参数描述 |
| -------- | ------ | ---- | ---- | -------- |
| model | - | String | 是 | 模型名称<br>可选值：`viduq2`、`viduq1`、`vidu2.0`<br>- `viduq2`：动态效果好，细节丰富<br>- `viduq1`：画面清晰，平滑转场，运镜稳定<br>- `vidu2.0`：生成速度快 |
| subjects | - | List[Array] | 是 | 图片主体信息，支持 1～7 个主体，主体图片共 1～7 张 |
| | id | String | 是 | 主体 ID，生成时可通过 `@主体id` 引用 |
| | images | Array[String] | 是 | 主体对应图片 URL/Base64，每个主体最多 3 张<br>注1：支持 Base64 或可访问 URL<br>注2：格式 `png`/`jpeg`/`jpg`/`webp`<br>注3：像素 ≥128×128，比例＜1:4 或 4:1，单图 ≤50MB<br>注4：POST body ≤20MB，Base64 需带前缀：`data:image/png;base64,{...}` |
| | voice_id | String | 可选 | 音色 ID，为空系统自动推荐；可与声音复刻 API 互通 |
| prompt | - | String | 是 | 视频文本描述<br>注1：长度 ≤2000 字符<br>注2：可通过 `@主体id` 指代主体，例：`@1 和 @2 吃火锅` |
| audio | - | Bool | 可选 | 是否开启音视频直出，默认 `false`<br>- `true`：启用音视频直出<br>- `false`：关闭 |
| duration | - | Int | 可选 | 视频时长<br>- `viduq2`：默认 5s，可选 1–10<br>- `viduq1`：默认 5s，仅可选 5<br>- `vidu2.0`：默认 4s，仅可选 4 |
| seed | - | Int | 可选 | 随机种子；不传/传 0 则随机，手动传参固定 |
| aspect_ratio | - | String | 可选 | 画面比例，默认 `16:9`<br>可选：`16:9`、`9:16`、`1:1`；q2 支持任意宽高比 |
| resolution | - | String | 可选 | 分辨率<br>- `viduq2(1-10s)`：默认 720p，可选 540p/720p/1080p<br>- `viduq1(5s)`：默认 1080p，仅可选 1080p<br>- `vidu2.0(4s)`：默认 360p，可选 360p/720p |
| movement_amplitude | - | String | 可选 | 运动幅度，默认 `auto`，可选 `auto`/`small`/`medium`/`large`<br>注：q2 模型不生效 |
| payload | - | String | 可选 | 透传参数，最大 1048576 字符 |
| off_peak | - | Bool | 可选 | 错峰模式，默认 `false`<br>- `true`：错峰生成（积分更低）<br>- `false`：即时生成<br>注1：48h 内完成，超时自动取消并退积分<br>注2：音视频直出**不支持**错峰 |
| watermark | - | Bool | 可选 | 是否加水印，默认 `false`（内容：由AI生成） |
| wm_position | - | Int | 可选 | 水印位置，默认 3<br>1：左上 / 2：右上 / 3：右下 / 4：左下 |
| wm_url | - | String | 可选 | 水印图片 URL，不传用默认 |
| meta_data | - | String | 可选 | 元数据 JSON 字符串，透传字段，为空用平台默认 |
| callback_url | - | String | 可选 | 回调地址（POST），状态变更推送<br>回调 `status`：`processing`/`success`/`failed`，失败重试 3 次 |

## 请求示例（curl）
```bash
curl -X POST -H "Authorization: Token {your_api_key}" -H "Content-Type: application/json" -d '
{
    "model": "viduq2",
    "subjects": [
        {
            "id": "your_subject1_id",
            "images": ["your_image_url1","your_image_url2","your_image_url3"],
            "voice_id": ""
        },
        {
            "id": "your_subject2_id",
            "images": ["your_image_url4","your_image_url5","your_image_url6"],
            "voice_id": ""
        }
    ],
    "prompt": "@your_subject1_id 和 @your_subject2_id 在一起吃火锅，并且旁白音说火锅大家都爱吃。",
    "duration": 8,
    "audio": true
}' https://api.vidu.cn/ent/v2/reference2video
```

## 响应体
| 字段 | 类型 | 描述 |
| ---- | ---- | ---- |
| task_id | String | 平台生成任务 ID |
| state | String | 状态：`created`/`queueing`/`processing`/`success`/`failed` |
| model | String | 本次模型 |
| prompt | String | 本次提示词 |
| images | Array[String] | 本次图像参数 |
| duration | Int | 本次时长 |
| seed | Int | 本次种子 |
| aspect_ratio | String | 本次比例 |
| resolution | String | 本次分辨率 |
| bgm | Bool | 本次背景音乐参数 |
| audio | Bool | 是否开启音视频直出 |
| movement_amplitude | String | 本次运动幅度 |
| payload | String | 透传参数 |
| off_peak | Bool | 是否错峰 |
| credits | Int | 消耗积分 |
| watermark | Bool | 是否水印 |
| created_at | String | 创建时间 |

## 响应示例
```json
{
  "task_id": "your_task_id_here",
  "state": "created",
  "model": "viduq2",
  "images": ["your_image_url1","your_image_url2"],
  "prompt": "@1 和 @2 在一起吃火锅，并且旁白音说火锅大家都爱吃。",
  "duration": 8,
  "seed": random_number,
  "aspect_ratio": "3:4",
  "resolution": "1080p",
  "movement_amplitude": "auto",
  "payload": "",
  "off_peak": false,
  "credits": credits_number,
  "created_at": "2025-01-01T15:41:31.968916Z"
}
```

---

# 二、非主体调用（视频生成）
## 请求体
| 参数名称 | 子参数 | 类型 | 必填 | 参数描述 |
| -------- | ------ | ---- | ---- | -------- |
| model | - | String | 是 | 模型名称<br>可选值：`viduq2-pro`、`viduq2`、`viduq1`、`vidu2.0`<br>- `viduq2-pro`：支持参考视频、视频编辑/替换<br>- `viduq2`：动态好、细节丰富<br>- `viduq1`：清晰稳定<br>- `vidu2.0`：速度快 |
| images | - | Array[String] | 是 | 参考图，1～7 张（`viduq2-pro` 传视频时限 1～4 张）<br>注1～6 同主体调用图片规则 |
| videos | - | Array[String] | 是 | 参考视频，1～2 个（仅 `viduq2-pro` 支持）<br>注1：最多 1×8s 或 2×5s<br>注2：格式 `mp4`/`avi`/`mov`<br>注3：像素 ≥128×128，比例＜1:4/4:1，≤100MB<br>注4：Base64 解码后＜20MB，前缀：`data:video/mp4;base64,{...}` |
| prompt | - | String | 是 | 视频描述，≤2000 字符 |
| bgm | - | Bool | 可选 | 是否加背景音乐，默认 `false`<br>注：q2 系列 `duration=9/10s` 不生效 |
| duration | - | Int | 可选 | 时长<br>- `viduq2-pro`：默认 5s，可选 0–10（0=自动）<br>- `viduq2`：默认 5s，1–10<br>- `viduq1`：5s 固定<br>- `vidu2.0`：4s 固定 |
| seed | - | Int | 可选 | 随机种子规则同上 |
| aspect_ratio | - | String | 可选 | 默认 `16:9`，可选 `16:9`/`9:16`/`4:3`/`3:4`/`1:1`<br>注：`4:3`/`3:4` 仅 q2 系列支持 |
| resolution | - | String | 可选 | 分辨率<br>- `viduq2-pro(0-10s)`：默认 720p，可选 540p/720p/1080p<br>- `viduq2(1-10s)`：默认 720p，可选 540p/720p/1080p<br>- `viduq1(5s)`：1080p 固定<br>- `vidu2.0(4s)`：默认 360p，可选 360p/720p |
| movement_amplitude | - | String | 可选 | 运动幅度，默认 `auto`；q2 系列不生效 |
| payload | - | String | 可选 | 透传参数，最大 1048576 字符 |
| off_peak | - | Bool | 可选 | 错峰模式，规则同上；音视频直出不支持 |
| watermark | - | Bool | 可选 | 水印开关，默认 `false` |
| wm_position | - | Int | 可选 | 水印位置，默认 3 |
| wm_url | - | String | 可选 | 水印图片 URL |
| meta_data | - | String | 可选 | 元数据 JSON 字符串 |
| callback_url | - | String | 可选 | 回调地址，规则同上 |

## 请求示例（curl）
```bash
curl -X POST -H "Authorization: Token {your_api_key}" -H "Content-Type: application/json" -d '
{
    "model": "viduq2-pro",
    "images": [
        "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png",
        "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-2.png",
        "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-3.png"
    ],
    "videos": ["your_video1","your_video2"],
    "prompt": "Santa Claus and the bear hug by the lakeside.",
    "duration": 5,
    "seed": 0,
    "aspect_ratio": "3:4",
    "resolution": "540p",
    "movement_amplitude": "auto",
    "off_peak": false
}' https://api.vidu.cn/ent/v2/reference2video
```

## 响应体
| 字段 | 类型 | 描述 |
| ---- | ---- | ---- |
| task_id | String | 任务 ID |
| state | String | 状态：`created`/`queueing`/`processing`/`success`/`failed` |
| model | String | 模型 |
| prompt | String | 提示词 |
| images | Array[String] | 参考图 |
| videos | Array[String] | 参考视频 |
| duration | Int | 时长 |
| seed | Int | 种子 |
| aspect_ratio | String | 比例 |
| resolution | String | 分辨率 |
| bgm | Bool | 背景音乐 |
| audio | Bool | 音视频直出开关 |
| movement_amplitude | String | 运动幅度 |
| payload | String | 透传参数 |
| off_peak | Bool | 错峰 |
| credits | Int | 消耗积分 |
| watermark | Bool | 水印 |
| created_at | String | 创建时间 |

## 响应示例
```json
{
  "task_id": "your_task_id_here",
  "state": "created",
  "model": "viduq2-pro",
  "images": [
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png",
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-2.png",
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-3.png"
  ],
  "videos": ["your_video1","your_video2"],
  "prompt": "Santa Claus and the bear hug by the lakeside.",
  "duration": 5,
  "seed": random_number,
  "aspect_ratio": "3:4",
  "resolution": "540p",
  "movement_amplitude": "auto",
  "payload": "",
  "off_peak": false,
  "credits": credits_number,
  "created_at": "2025-01-01T15:41:31.968916Z"
}
```