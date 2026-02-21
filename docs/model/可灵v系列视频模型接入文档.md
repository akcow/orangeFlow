你希望将【文生视频】和【图生视频】两类API（各包含创建任务、查询单个任务、查询任务列表）的说明文档转换成规范、易读的Markdown格式，我已按照统一的API文档规范为你整理完成，保留了所有关键参数约束、示例和特殊规则说明。

---

# 视频生成 API 说明文档
## 一、文生视频 (Text2Video)
### 1.1 创建任务
#### 1.1.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/videos/text2video |
| 请求方法 | POST |
| 请求格式 | application/json |
| 响应格式 | application/json |

#### 1.1.2 请求头
| 字段 | 值 | 描述 |
|-----|-----|-----|
| Content-Type | application/json | 数据交换格式 |
| Authorization | 鉴权信息，参考接口鉴权 | 鉴权信息，参考接口鉴权 |

#### 1.1.3 请求体参数
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| model_name | string | 可选 | kling-v1 | 模型名称<br>● 枚举值：kling-v1, kling-v1-6, kling-v2-master, kling-v2-1-master, kling-v2-5-turbo, kling-v2-6, kling-v3 |
| multi_shot | boolean | 可选 | false | 是否生成多镜头视频<br>● 当前参数为true时，prompt参数无效<br>● 当前参数为false时，shot_type参数及multi_prompt参数无效 |
| shot_type | string | 可选 | 空 | 分镜方式<br>● 枚举值：customize，intelligence<br>● 当multi_shot参数为true时，当前参数必填 |
| prompt | string | 可选 | 空 | 文本提示词，可包含正向描述和负向描述<br>● 可将提示词模板化来满足不同的视频生成需求<br>Omni模型可通过Prompt与主体、图片、视频等内容实现多种能力：<br>1. 通过<<<>>>的格式来指定某个主体、图片、视频，如：<<<element_1>>>、<<<image_1>>>、<<<video_1>>><br>2. 更多信息详见：可灵视频 3.0 模型使用指南<br>● 不能超过2500个字符<br>● 用<<<voice_1>>>来指定音色，序号同voice_list参数所引用音色的排列顺序<br>● 一次视频生成任务至多引用2个音色；指定音色时，sound参数值必须为on<br>● 语法结构越简单越好，如：男人<<<voice_1>>>说：“你好”<br>● 当voice_list参数不为空且prompt参数中引用音色ID时，视频生成任务按“有指定音色”计量计费<br>● 当multi_shot参数为false或当shot_type参数为intelligence时，当前参数必填<br>不同模型版本支持能力范围不同，详见上文能力地图 |
| multi_prompt | array | 可选 | 空 | 各分镜提示词，可包含正向描述和负向描述<br>● 通过index、prompt、duration参数定义分镜序号及相应提示词和时长，其中：<br>  ○ 最多支持6个分镜，最小支持1个分镜<br>  ○ 每个分镜相关内容的最大长度不超过512<br>  ○ 每个分镜的时长不大于当前任务的总时长，不小于1<br>  ○ 所有分镜的时长之和等于当前任务的总时长<br>● 数据结构示例：<br>```json<br>"multi_prompt":[<br>  {<br>    "index":int,<br>    "prompt": "string",<br>    "duration": "5"<br>  },<br>  {<br>    "index":int,<br>    "prompt": "string",<br>    "duration": "5"<br>  }<br>]<br>```<br>● 当multi-shot参数为true且shot-type参数为customize时，当前参数不得为空 |
| negative_prompt | string | 可选 | 空 | 负向文本提示词<br>● 建议直接在正向提示词中，通过否定句来补充负向提示词信息<br>● 不能超过2500个字符 |
| voice_list | array | 可选 | 无 | 生成视频时所引用的音色的列表<br>● 一次视频生成任务至多引用2个音色<br>● 当voice_list参数不为空且prompt参数中引用音色ID时，视频生成任务按“有指定音色”计量计费<br>● voice_id参数值通过音色定制接口返回，也可使用系统预置音色，详见音色定制相关API；非对口型API的voice_id<br>● 数据结构示例：<br>```json<br>"voice_list":[<br>  {"voice_id":"voice_id_1"},<br>  {"voice_id":"voice_id_2"}<br>]<br>``` |
| sound | string | 可选 | off | 生成视频时是否同时生成声音<br>● 枚举值：on，off<br>仅V2.6及后续版本模型支持当前参数 |
| cfg_scale | float | 可选 | 0.5 | 生成视频的自由度；值越大，模型自由度越小，与用户输入的提示词相关性越强<br>● 取值范围：[0, 1]<br>仅kling-v1.x模型支持当前参数 |
| mode | string | 可选 | std | 生成视频的模式<br>● 枚举值：std，pro<br>● 其中std：标准模式（标准），基础模式，生成720P视频，性价比高<br>● 其中pro：专家模式（高品质），高表现模式，生成1080P视频，视频质量更佳<br>不同模型版本支持能力范围不同，详见上文能力地图 |
| aspect_ratio | string | 可选 | 16:9 | 生成视频的画面纵横比（宽:高）<br>● 枚举值：16:9, 9:16, 1:1 |
| duration | string | 可选 | 5 | 生成视频时长，单位s<br>● 枚举值：3，4，5，6，7，8，9，10，11，12，13，14，15<br>不同模型版本支持能力范围不同，详见上文能力地图 |
| watermark_info | array | 可选 | 空 | 是否同时生成含水印的结果<br>● 通过enabled参数定义，数据结构示例：<br>```json<br>"watermark_info": {<br>  "enabled": boolean // true 为生成，false 为不生成<br>}<br>```<br>● 暂不支持自定义水印 |
| callback_url | string | 可选 | 无 | 本次任务结果回调通知地址，如果配置，服务端会在任务状态发生变更时主动通知<br>● 具体通知的消息schema见“Callback协议” |
| external_task_id | string | 可选 | 无 | 自定义任务ID<br>● 用户自定义任务ID，传入不会覆盖系统生成的任务ID，但支持通过该ID进行任务查询<br>● 请注意，单用户下需要保证唯一性 |

#### 1.1.4 响应体
```json
{
  "code": 0, //错误码；具体定义见错误码
  "message": "string", //错误信息
  "request_id": "string", //请求ID，系统生成，用于跟踪请求、排查问题
  "data":{
    "task_id": "string", //任务ID，系统生成
    "task_info":{ //任务创建时的参数信息
       "external_task_id": "string"//客户自定义任务ID
    }, 
    "task_status": "string", //任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
    "created_at": 1722769557708, //任务创建时间，Unix时间戳、单位ms
    "updated_at": 1722769557708 //任务更新时间，Unix时间戳、单位ms
  }
}
```

#### 1.1.5 调用示例
```bash
curl --location 'https://xxx/v1/videos/text2video' \
--header 'Authorization: Bearer xxx' \
--header 'Content-Type: application/json' \
--data '{
    "model_name": "kling-v3",
    "prompt": "",
    "multi_prompt": [
        {
            "index": 1,
            "prompt": "Two friends talking under a streetlight at night.  Warm glow, casual poses, no dialogue.",
            "duration": "2"
        },
        {
            "index": 2,
            "prompt": "A runner sprinting through a forest, leaves flying.  Low-angle shot, focus on movement.",
            "duration": "3"
        },
        {
            "index": 3,
            "prompt": "A woman hugging a cat, smiling.  Soft sunlight, cozy home setting, emphasize warmth.",
            "duration": "3"
        },
        {
            "index": 4,
            "prompt": "A door creaking open, shadowy hallway.  Dark tones, minimal details, eerie mood.",
            "duration": "3"
        },
        {
            "index": 5,
            "prompt": "A man slipping on a banana peel, shocked expression.  Exaggerated pose, bright colors.",
            "duration": "3"
        },
        {
            "index": 6,
            "prompt": "A sunset over mountains, small figure walking away.  Wide angle, peaceful atmosphere.",
            "duration": "1"
        }
    ],
    "multi_shot": true,
    "shot_type": "customize",
    "duration": "15",
    "mode": "pro",
    "sound": "on",
    "aspect_ratio": "9:16",
    "callback_url": "",
    "external_task_id": ""
}'
```

### 1.2 查询任务（单个）
#### 1.2.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/videos/text2video/{id} |
| 请求方法 | GET |
| 请求格式 | application/json |
| 响应格式 | application/json |

#### 1.2.2 请求头
| 字段 | 值 | 描述 |
|-----|-----|-----|
| Content-Type | application/json | 数据交换格式 |
| Authorization | 鉴权信息，参考接口鉴权 | 鉴权信息，参考接口鉴权 |

#### 1.2.3 请求路径参数
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| task_id | string | 可选 | 无 | 文生视频的任务ID<br>● 请求路径参数，直接将值填写在请求路径中，与external_task_id两种查询方式二选一 |
| external_task_id | string | 可选 | 无 | 文生视频的自定义任务ID<br>● 创建任务时填写的external_task_id，与task_id两种查询方式二选一 |

#### 1.2.4 请求体
无

#### 1.2.5 响应体
```json
{
  "code": 0, //错误码；具体定义见错误码
  "message": "string", //错误信息
  "request_id": "string", //请求ID，系统生成，用于跟踪请求、排查问题
  "data":{
    "task_id": "string", //任务ID，系统生成 
    "task_status": "string", //任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
    "task_status_msg": "string", //任务状态信息，当任务失败时展示失败原因（如触发平台的内容风控等）
    "task_info": { //任务创建时的参数信息
      "external_task_id": "string"//客户自定义任务ID
    },
    "task_result":{
      "videos":[
        {
          "id": "string", //生成的视频ID；全局唯一
          "url": "string", //生成视频的URL，例如https://p1.a.kwimgs.com/bs2/upload-ylab-stunt/special-effect/output/HB1_PROD_ai_web_46554461/-2878350957757294165/output.mp4（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "watermark_url": "string", // 含水印视频下载URL，防盗链格式
          "duration": "string" //视频总时长，单位s
        }
      ]
    },
    "watermark_info": {
      "enabled": boolean
    },    
    "final_unit_deduction": "string", // 任务最终扣减积分数值
    "created_at": 1722769557708, //任务创建时间，Unix时间戳、单位ms
    "updated_at": 1722769557708 //任务更新时间，Unix时间戳、单位ms
  }
}
```

### 1.3 查询任务（列表）
#### 1.3.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/videos/text2video |
| 请求方法 | GET |
| 请求格式 | application/json |
| 响应格式 | application/json |

#### 1.3.2 请求头
| 字段 | 值 | 描述 |
|-----|-----|-----|
| Content-Type | application/json | 数据交换格式 |
| Authorization | 鉴权信息，参考接口鉴权 | 鉴权信息，参考接口鉴权 |

#### 1.3.3 查询参数
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| pageNum | int | 可选 | 1 | 页码<br>● 取值范围：[1,1000] |
| pageSize | int | 可选 | 30 | 每页数据量<br>● 取值范围：[1,500] |
> 请求示例：`/v1/videos/text2video?pageNum=1&pageSize=30`

#### 1.3.4 请求体
无

#### 1.3.5 响应体
```json
{
  "code": 0, //错误码；具体定义见错误码
  "message": "string", //错误信息
  "request_id": "string", //请求ID，系统生成，用于跟踪请求、排查问题
  "data":[
    {
      "task_id": "string", //任务ID，系统生成
      "task_status": "string", //任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
      "task_status_msg": "string", //任务状态信息，当任务失败时展示失败原因（如触发平台的内容风控等）
      "task_info": { //任务创建时的参数信息
        "external_task_id": "string"//任务ID，客户自定义生成，与task_id两种查询方式二选一
      },
      "task_result":{
        "videos":[
          {
            "id": "string", //生成的视频ID；全局唯一
            "url": "string", //生成视频的URL，例如https://p1.a.kwimgs.com/bs2/upload-ylab-stunt/special-effect/output/HB1_PROD_ai_web_46554461/-2878350957757294165/output.mp4（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
            "watermark_url": "string", // 含水印视频下载URL，防盗链格式
            "duration": "string" //视频总时长，单位s
          }
        ]
      },
      "watermark_info": {
        "enabled": boolean
      },
      "final_unit_deduction": "string", // 任务最终扣减积分数值
      "created_at": 1722769557708, //任务创建时间，Unix时间戳、单位ms
      "updated_at": 1722769557708 //任务更新时间，Unix时间戳、单位ms
    }
  ]
}
```

## 二、图生视频 (Image2Video)
### 2.1 创建任务
#### 2.1.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/videos/image2video |
| 请求方法 | POST |
| 请求格式 | application/json |
| 响应格式 | application/json |

#### 2.1.2 请求头
| 字段 | 值 | 描述 |
|-----|-----|-----|
| Content-Type | application/json | 数据交换格式 |
| Authorization | 鉴权信息，参考接口鉴权 | 鉴权信息，参考接口鉴权 |

#### 2.1.3 请求体参数
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| model_name | string | 可选 | kling-v1 | 模型名称<br>● 枚举值：kling-v1, kling-v1-5, kling-v1-6, kling-v2-master, kling-v2-1, kling-v2-1-master, kling-v2-5-turbo, kling-v2-6, kling-v3 |
| image | string | 可选 | 空 | 参考图像<br>● 支持传入图片Base64编码或图片URL（确保可访问）<br>请注意，若您使用base64的方式，请确保您传递的所有图像数据参数均采用Base64编码格式。在提交数据时，请不要在Base64编码字符串前添加任何前缀，例如data:image/png;base64,。正确的参数格式应该直接是Base64编码后的字符串。<br>示例：<br>正确的Base64编码参数：<br>iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==<br>错误的Base64编码参数（包含data:前缀）：<br>data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==<br>请仅提供Base64编码的字符串部分，以便系统能够正确处理和解析您的数据。<br>● 图片格式支持.jpg / .jpeg / .png<br>● 图片文件大小不能超过10MB，图片宽高尺寸不小于300px，图片宽高比介于1:2.5 ~ 2.5:1之间<br>● image参数与image_tail参数至少二选一，二者不能同时为空<br>不同模型版本、视频模式支持范围不同，详见当前文档3-0能力地图 |
| image_tail | string | 可选 | 空 | 参考图像 - 尾帧控制<br>● 支持传入图片Base64编码或图片URL（确保可访问）<br>Base64编码要求同image参数<br>● 图片格式支持.jpg / .jpeg / .png<br>● 图片文件大小不能超过10MB，图片宽高尺寸不小于300px<br>● image参数与image_tail参数至少二选一，二者不能同时为空<br>● image_tail参数、dynamic_masks/static_mask参数、camera_control参数三选一，不能同时使用<br>不同模型版本、视频模式支持范围不同，详见当前文档3-0能力地图 |
| multi_shot | boolean | 可选 | false | 是否生成多镜头视频<br>● 当前参数为true时，prompt参数无效<br>● 当前参数为false时，shot_type参数及multi_prompt参数无效 |
| shot_type | string | 可选 | 空 | 分镜方式<br>● 枚举值：customize，intelligence<br>● 当multi_shot参数为true时，当前参数必填 |
| prompt | string | 可选 | 空 | 文本提示词，可包含正向描述和负向描述<br>● 可将提示词模板化来满足不同的视频生成需求<br>Omni模型可通过Prompt与主体、图片、视频等内容实现多种能力：<br>1. 通过<<<>>>的格式来指定某个主体、图片、视频，如：<<<element_1>>>、<<<image_1>>>、<<<video_1>>><br>2. 更多信息详见：可灵视频 3.0 模型使用指南<br>● 不能超过2500个字符<br>● 用<<<voice_1>>>来指定音色，序号同voice_list参数所引用音色的排列顺序<br>● 一次视频生成任务至多引用2个音色；指定音色时，sound参数值必须为on<br>● 语法结构越简单越好，如：男人<<<voice_1>>>说：“你好”<br>● 当voice_list参数不为空且prompt参数中引用音色ID时，视频生成任务按“有指定音色”计量计费<br>● 当multi_shot参数为false或当shot_type参数为intelligence时，当前参数必填<br>不同模型版本支持能力范围不同，详见上文能力地图 |
| multi_prompt | array | 可选 | 空 | 各分镜信息，如提示词、时长等<br>● 通过index、prompt、duration参数定义分镜序号及相应提示词和时长，其中：<br>  ○ 最多支持6个分镜，最小支持1个分镜<br>  ○ 每个分镜相关内容的最大长度不超过512<br>  ○ 每个分镜的时长不大于当前任务的总时长，不小于1<br>  ○ 所有分镜的时长之和等于当前任务的总时长<br>● 数据结构示例：<br>```json<br>"multi_prompt":[<br>  {<br>    "index":int,<br>    "prompt": "string",<br>    "duration": "5"<br>  },<br>  {<br>    "index":int,<br>    "prompt": "string",<br>    "duration": "5"<br>  }<br>]<br>```<br>● 当mult_shot参数为true且shot_type参数为customize时，当前参数不得为空 |
| negative_prompt | string | 可选 | 空 | 负向文本提示词<br>● 建议直接在正向提示词中，通过否定句来补充负向提示词信息<br>● 不能超过2500个字符 |
| element_list | array | 可选 | 空 | 参考主体列表<br>● 基于主体库中主体的ID配置，数据结构示例：<br>```json<br>"element_list":[<br>  {<br>    "element_id":long<br>  },<br>  {<br>    "element_id":long<br>  }<br>]<br>```<br>● 最多支持3个参考主体<br>● 主体分为视频定制主体（简称：视频角色主体）和图片定制主体（简称：多图主体），适用范围不同，请注意区分<br>● 更多主体信息详见：可灵「主体库 3.0」使用指南<br>● element_list参数与voice_list参数互斥，不能共存<br>不同模型版本支持能力范围不同，详见上文能力地图 |
| voice_list | array | 可选 | 无 | 生成视频时所引用的音色的列表<br>● 一次视频生成任务至多引用2个音色<br>● 当voice_list参数不为空且prompt参数中引用音色ID时，视频生成任务按“有指定音色”计量计费<br>● voice_id参数值通过音色定制接口返回，也可使用系统预置音色，详见音色定制相关API；非对口型API的voice_id。<br>● 数据结构示例：<br>```json<br>"voice_list":[<br>  {"voice_id":"voice_id_1"},<br>  {"voice_id":"voice_id_2"}<br>]<br>```<br>● element_list参数与voice_list参数互斥，不能共存 |
| sound | string | 可选 | off | 生成视频时是否同时生成声音<br>● 枚举值：on，off<br>仅V2.6及后续版本模型支持当前参数 |
| cfg_scale | float | 可选 | 0.5 | 生成视频的自由度；值越大，模型自由度越小，与用户输入的提示词相关性越强<br>● 取值范围：[0, 1]<br>仅kling-v1.x模型支持当前参数 |
| mode | string | 可选 | std | 生成视频的模式<br>● 枚举值：std，pro<br>● 其中std：标准模式（标准），基础模式，生成720P视频，性价比高<br>● 其中pro：专家模式（高品质），高表现模式，生成1080P视频，视频质量更佳<br>不同模型版本支持能力范围不同，详见上文能力地图 |
| duration | string | 可选 | 5 | 生成视频时长，单位s<br>● 枚举值：3，4，5，6，7，8，9，10，11，12，13，14，15 |
| watermark_info | array | 可选 | 空 | 是否同时生成含水印的结果<br>● 通过enabled参数定义，数据结构示例：<br>```json<br>"watermark_info": {<br>  "enabled": boolean // true 为生成，false 为不生成<br>}<br>```<br>● 暂不支持自定义水印 |
| callback_url | string | 可选 | 无 | 本次任务结果回调通知地址，如果配置，服务端会在任务状态发生变更时主动通知<br>● 具体通知的消息schema见“Callback协议” |
| external_task_id | string | 可选 | 无 | 自定义任务ID<br>● 用户自定义任务ID，传入不会覆盖系统生成的任务ID，但支持通过该ID进行任务查询<br>● 请注意，单用户下需要保证唯一性 |

#### 2.1.4 响应体
```json
{
  "code": 0, //错误码；具体定义见错误码
  "message": "string", //错误信息
  "request_id": "string", //请求ID，系统生成，用于跟踪请求、排查问题
  "data":{
    "task_id": "string", //任务ID，系统生成
    "task_info":{ //任务创建时的参数信息
       "external_task_id": "string" //客户自定义任务ID
    }, 
    "task_status": "string", //任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
    "created_at": 1722769557708, //任务创建时间，Unix时间戳、单位ms
    "updated_at": 1722769557708 //任务更新时间，Unix时间戳、单位ms
  }
}
```

#### 2.1.5 调用示例
##### 示例1：多镜头效果的图生视频
```bash
curl --location 'https://xxx/v1/videos/image2video' \
--header 'Authorization: Bearer xxx' \
--header 'Content-Type: application/json' \
--data '{
    "model_name": "kling-v3",
    "image": "xxx",
    "prompt": "",
    "multi_shot": "true",
    "shot_type": "customize",
    "multi_prompt": [
        {
            "index": 1,
            "prompt": "Two friends talking under a streetlight at night.  Warm glow, casual poses, no dialogue.",
            "duration": "2"
        },
        {
            "index": 2,
            "prompt": "A runner sprinting through a forest, leaves flying.  Low-angle shot, focus on movement.",
            "duration": "3"
        },
        {
            "index": 3,
            "prompt": "A woman hugging a cat, smiling.  Soft sunlight, cozy home setting, emphasize warmth.",
            "duration": "3"
        },
        {
            "index": 4,
            "prompt": "A door creaking open, shadowy hallway.  Dark tones, minimal details, eerie mood.",
            "duration": "3"
        },
        {
            "index": 5,
            "prompt": "A man slipping on a banana peel, shocked expression.  Exaggerated pose, bright colors.",
            "duration": "3"
        },
        {
            "index": 6,
            "prompt": "A sunset over mountains, small figure walking away.  Wide angle, peaceful atmosphere.",
            "duration": "1"
        }
    ],
    "negative_prompt": "",
    "duration": "15",
    "mode": "pro",
    "sound": "on",
    "callback_url": "",
    "external_task_id": ""
}'
```

##### 示例2：引用主体及主体音色的图生视频
```bash
curl --location 'https://xxx/v1/videos/image2video' \
--header 'Authorization: Bearer xxx' \
--header 'Content-Type: application/json' \
--data '{
    "model_name": "kling-v3",
    "image": "xxx",
    "image_tail": "xxx",
    "prompt": "The girl with <<<element_1>>> (using <<<voice_1>>>) communicates with the girl with <<<image_1>>> (using <<<voice_2>>>)",
    "element_list": [
        {
            "element_id": long
        }
    ],
    "voice_list": [
        {
            "voice_id": long
        },
        {
            "voice_id": long
        }
    ],
    "negative_prompt": "xxx",
    "duration": "9",
    "mode": "std",
    "sound": "on",
    "callback_url": "xxx",
    "external_task_id": "",
}'
```

### 2.2 查询任务（单个）
#### 2.2.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/videos/image2video/{id} |
| 请求方法 | GET |
| 请求格式 | application/json |
| 响应格式 | application/json |

#### 2.2.2 请求头
| 字段 | 值 | 描述 |
|-----|-----|-----|
| Content-Type | application/json | 数据交换格式 |
| Authorization | 鉴权信息，参考接口鉴权 | 鉴权信息，参考接口鉴权 |

#### 2.2.3 请求路径参数
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| task_id | string | 可选 | 空 | 图生视频的任务ID<br>● 请求路径参数，直接将值填写在请求路径中，与external_task_id两种查询方式二选一 |
| external_task_id | string | 可选 | 空 | 图生视频的自定义任务ID<br>● 创建任务时填写的external_task_id，与task_id两种查询方式二选一 |

#### 2.2.4 请求体
无

#### 2.2.5 响应体
```json
{
  "code": 0, //错误码；具体定义见错误码
  "message": "string", //错误信息
  "request_id": "string", //请求ID，系统生成，用于跟踪请求、排查问题
  "data":{
    "task_id": "string", //任务ID，系统生成
    "task_status": "string", //任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
    "task_status_msg": "string", //任务状态信息，当任务失败时展示失败原因（如触发平台的内容风控等）
    "task_info": { //任务创建时的参数信息
      "external_task_id": "string"//客户自定义任务ID
    },
    "task_result":{
      "videos":[
        {
          "id": "string", //生成的视频ID；全局唯一
          "url": "string", //生成视频的URL，例如https://p1.a.kwimgs.com/bs2/upload-ylab-stunt/special-effect/output/HB1_PROD_ai_web_46554461/-2878350957757294165/output.mp4（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "watermark_url": "string", // 含水印视频下载URL，防盗链格式
          "duration": "string" //视频总时长，单位s
        }
      ]
    },
    "watermark_info": {
      "enabled": boolean
    },
    "final_unit_deduction": "string", // 任务最终扣减积分数值
    "created_at": 1722769557708, //任务创建时间，Unix时间戳、单位ms
    "updated_at": 1722769557708 //任务更新时间，Unix时间戳、单位ms
  }
}
```

### 2.3 查询任务（列表）
#### 2.3.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/videos/image2video |
| 请求方法 | GET |
| 请求格式 | application/json |
| 响应格式 | application/json |

#### 2.3.2 请求头
| 字段 | 值 | 描述 |
|-----|-----|-----|
| Content-Type | application/json | 数据交换格式 |
| Authorization | 鉴权信息，参考接口鉴权 | 鉴权信息，参考接口鉴权 |

#### 2.3.3 查询参数
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| pageNum | int | 可选 | 1 | 页码<br>● 取值范围：[1,1000] |
| pageSize | int | 可选 | 30 | 每页数据量<br>● 取值范围：[1,500] |
> 请求示例：`/v1/videos/image2video?pageNum=1&pageSize=30`

#### 2.3.4 请求体
无

#### 2.3.5 响应体
```json
{
  "code": 0, //错误码；具体定义见错误码
  "message": "string", //错误信息
  "request_id": "string", //请求ID，系统生成，用于跟踪请求、排查问题
  "data":[
    {
      "task_id": "string", //任务ID，系统生成
      "task_status": "string", //任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
      "task_status_msg": "string", //任务状态信息，当任务失败时展示失败原因（如触发平台的内容风控等）
      "task_info": { //任务创建时的参数信息
        "external_task_id": "string"//客户自定义任务ID
      },
      "task_result":{
        "videos":[
          {
            "id": "string", //生成的视频ID；全局唯一
            "url": "string", //生成视频的URL，例如https://p1.a.kwimgs.com/bs2/upload-ylab-stunt/special-effect/output/HB1_PROD_ai_web_46554461/-2878350957757294165/output.mp4（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
            "watermark_url": "string", // 含水印视频下载URL，防盗链格式
            "duration": "string" //视频总时长，单位s
          }
        ]
      },
      "watermark_info": {
        "enabled": boolean
      },
      "final_unit_deduction": "string", // 任务最终扣减积分数值
      "created_at": 1722769557708, //任务创建时间，Unix时间戳、单位ms
      "updated_at": 1722769557708 //任务更新时间，Unix时间戳、单位ms
    }
  ]
}
```

---
