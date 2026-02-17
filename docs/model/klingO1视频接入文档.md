你希望将Omni-Video相关的三个API（创建任务、查询单个任务、查询任务列表）的说明文档转换成规范、易读的Markdown格式，我已按照API文档的最佳实践为你整理完成，内容结构清晰且保留了所有关键信息。

---

# Omni-Video API 说明文档
## 1. 创建任务
### 1.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/videos/omni-video |
| 请求方法 | POST |
| 请求格式 | application/json |
| 响应格式 | application/json |

### 1.2 请求头
| 字段 | 值 | 描述 |
|-----|-----|-----|
| Content-Type | application/json | 数据交换格式 |
| Authorization | 鉴权信息，参考接口鉴权 | 鉴权信息，参考接口鉴权 |

### 1.3 请求体参数
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| model_name | string | 可选 | kling-video-o1 | 模型名称<br>● 枚举值：kling-video-o1, kling-v3-omni |
| multi_shot | boolean | 可选 | false | 是否生成多镜头视频<br>● 当前参数为true时，prompt参数无效<br>● 当前参数为false时，shot_type参数及multi_prompt参数无效 |
| shot_type | string | 可选 | 空 | 分镜方式<br>● 枚举值：customize<br>● 当multi_shot参数为true时，当前参数必填 |
| prompt | string | 可选 | 空 | 文本提示词，可包含正向描述和负向描述<br>● 可将提示词模板化来满足不同的视频生成需求<br>Omni模型可通过Prompt与主体、图片、视频等内容实现多种能力：<br>1. 通过<<<>>>的格式来指定某个主体、图片、视频，如：<<<element_1>>>、<<<image_1>>>、<<<video_1>>><br>2. 更多信息详见：可灵视频 3.0 Omni 使用指南<br>● 长度不能超过2500个字符<br>● 当multi_shot参数为false或shot-type参数为intelligence时，当前参数不得为空<br>不同模型版本支持能力范围不同，详见上文能力地图 |
| multi_prompt | array | 可选 | 空 | 各分镜信息，如提示词、时长等<br>● 通过index、prompt、duration参数定义分镜序号及相应提示词和时长，其中：<br>  ○ 最多支持6个分镜，最小支持1个分镜<br>  ○ 每个分镜相关内容的最大长度不超过512<br>  ○ 每个分镜的时长不大于当前任务的总时长，不小于1<br>  ○ 所有分镜的时长之和等于当前任务的总时长<br>● 数据结构示例：<br>```json<br>"multi_prompt":[<br>  {<br>    "index":int,<br>    "prompt": "string",<br>    "duration": "5"<br>  },<br>  {<br>    "index":int,<br>    "prompt": "string",<br>    "duration": "5"<br>  }<br>]<br>```<br>● 当multi_shot参数为true且shot_type参数为customize时，当前参数不得为空 |
| image_list | array | 可选 | 空 | 参考图列表<br>● 包括主体、场景、风格等参考图片，也可作为首帧或尾帧生成视频；当作为首帧或尾帧生成视频时：<br>  ○ 通过type参数来定义图片是否为首尾帧：first_frame为首帧，end_frame为尾帧<br>    ■ 暂时不支持仅尾帧，即有尾帧图时必须有首帧图<br>  ○ 使用首帧或首尾帧生成视频时，不能使用视频编辑功能；<br>● 数据结构示例：<br>```json<br>"image_list":[<br>  {<br>    "image_url":"image_url",<br>    "type":"first_frame"<br>  },<br>  {<br>    "image_url":"image_url",<br>    "type":"end_frame"<br>  }<br>]<br>```<br>● 支持传入图片Base64编码或图片URL（确保可访问）<br>● 图片格式支持.jpg / .jpeg / .png<br>● 图片文件大小不能超过10MB，图片宽高尺寸不小于300px，图片宽高比要在1:2.5 ~ 2.5:1之间<br>● 参考图片数量与有无参考视频、参考主体数量有关，其中：<br>  ○ 有参考视频时，参考图片数量和参考主体数量之和不得超过4；<br>  ○ 无参考视频时，参考图片数量和参考主体数量之和不得超过7；<br>  ○ 参考图片数量超过2时，不支持设置尾帧；<br>● image_url参数值不得为空<br>不同模型版本支持能力范围不同，详见上文能力地图 |
| element_list | array | 可选 | 空 | 参考主体列表<br>● 基于主体库中主体的ID配置，数据结构示例：<br>```json<br>"element_list":[<br>  {<br>    "element_id":long<br>  },<br>  {<br>    "element_id":long<br>  }<br>]<br>```<br>● 参考主体数量与有无参考视频、参考图片数量有关，其中：<br>  ○ 如果使用首帧生视频或首尾帧生视频时，最多支持3个主体；<br>  ○ 有参考视频时，参考图片数量和参考主体数量之和不得超过4，且不支持使用视频角色主体；<br>  ○ 无参考视频时，参考图片数量和参考主体数量之和不得超过7；<br>● 主体分为视频定制主体（简称：视频角色主体）和图片定制主体（简称：多图主体），适用范围不同，请注意区分<br>● 更多主体信息详见：可灵「主体库 3.0」使用指南<br>不同模型版本支持能力范围不同，详见上文能力地图 |
| video_list | array | 可选 | 空 | 参考视频，通过URL方式获取<br>● 可作为特征参考视频，也可作为待编辑视频，默认为待编辑视频；可选择性保留视频原声<br>  ○ 通过refer_type参数区分参考视频类型：feature为特征参考视频，base为待编辑视频<br>  ○ 参考视频为待编辑视频时，不能定义视频首尾帧<br>  ○ 通过keep_original_sound参数选择是否保留视频原声，yes为保留，no为不保留；当前参数对特征参考视频（feature）也生效<br>● 有参考视频时，sound参数值只能为off<br>● 数据结构示例：<br>```json<br>"video_list":[<br>  {<br>    "video_url":"video_url",<br>    "refer_type":"base",<br>    "keep_original_sound":"yes"<br>  }<br>]<br>```<br>● 视频格式仅支持MP4/MOV<br>● 视频时长不少于3秒，上限与模型版本有关，详见能力地图<br>● 视频宽高尺寸需介于720px（含）和2160px（含）之间<br>● 视频帧率基于24fps～60fps，生成视频时会输出为24fps<br>● 至多仅支持上传1段视频，视频大小不超过200MB<br>● video_url参数值不得为空<br>不同模型版本支持能力范围不同，详见上文能力地图 |
| sound | string | 可选 | off | 生成视频时是否同时生成声音<br>● 枚举值：on，off<br>仅V2.6及后续版本模型支持当前参数 |
| mode | string | 可选 | pro | 生成视频的模式<br>● 枚举值：std，pro<br>● 其中std：标准模式（标准），基础模式，生成720P视频，性价比高<br>● 其中pro：专家模式（高品质），高表现模式，生成1080P视频，视频质量更佳<br>不同模型版本支持能力范围不同，详见上文能力地图 |
| aspect_ratio | string | 可选 | 空 | 生成视频的画面纵横比（宽:高）<br>● 枚举值：16:9, 9:16, 1:1<br>● 未使用首帧参考或视频编辑功能时，当前参数必填 |
| duration | string | 可选 | 5 | 生成视频时长，单位s<br>● 枚举值：3，4，5，6，7，8，9，10，11，12，13，14，15<br>● 其中：使用视频编辑功能（"refer_type":"base"）时，输出结果与传入视频时长相同，此时当前参数无效；此时，按输入视频时长四舍五入取整计量计费<br>不同模型版本支持能力范围不同，详见上文能力地图 |
| watermark_info | array | 可选 | 空 | 是否同时生成含水印的结果<br>● 通过enabled参数定义，数据结构示例：<br>```json<br>"watermark_info": {<br>  "enabled": boolean // true 为生成，false 为不生成<br>}<br>```<br>● 暂不支持自定义水印 |
| callback_url | string | 可选 | 空 | 本次任务结果回调通知地址，如果配置，服务端会在任务状态发生变更时主动通知<br>● 具体通知的消息schema见“Callback协议” |
| external_task_id | string | 可选 | 空 | 自定义任务ID<br>● 用户自定义任务ID，传入不会覆盖系统生成的任务ID，但支持通过该ID进行任务查询<br>● 请注意，单用户下需要保证唯一性 |

### 1.4 响应体
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

### 1.5 调用示例
#### 示例1：多镜头效果的图生视频
```bash
curl --location 'https://xxx/v1/videos/omni-video/' \
--header 'Authorization: Bearer xxx' \
--header 'Content-Type: application/json' \
--data '{
    "model_name": "kling-v3-omni",
    "multi_shot": true,
    "shot_type": "customize",
    "prompt": "",
    "multi_prompt": [
      {
        "index": 1,
        "prompt": "<<<image_1>>>A person sitting on a park bench, sunlight filtering through trees.  Simple composition, no dialogue.",
        "duration": "2"
      },
      {
        "index": 2,
        "prompt": "A car speeding down a rainy street, headlights glowing.  Dynamic angle, focus on motion.",
        "duration": "3"
      }
    ],
    "image_list": [
      {
        "image_url": "xx"
      } ,
      {
        "image_url": "xxx"
      }
    ],
    "video_list": [],
    "mode": "pro",
    "sound": "on",
    "aspect_ratio": "16:9",
    "duration": "5",  
    "callback_url": "xx",
    "external_task_id": ""
  }'
```

#### 示例2：多镜头效果的文生视频
```bash
curl --location 'https://xxx/v1/videos/omni-video/' \
--header 'Authorization: Bearer xxx' \
--header 'Content-Type: application/json; charset=utf-8' \
--data '{
    "model_name": "kling-v3-omni",
    "multi_shot": true,
    "shot_type": "customize",
    "prompt": "",
    "multi_prompt": [
      {
        "index": 1,
        "prompt": "Two friends talking under a streetlight at night. Warm glow, casual poses, no dialogue.",
        "duration": "2"
      },
      {
        "index": 2,
        "prompt": "A runner sprinting through a forest, leaves flying. Low-angle shot, focus on movement.",
        "duration": "3"
      },
      {
        "index": 3,
        "prompt": "A woman hugging a cat, smiling. Soft sunlight, cozy home setting, emphasize warmth.",
        "duration": "3"
      },
      {
        "index": 4,
        "prompt": "A door creaking open, shadowy hallway. Dark tones, minimal details, eerie mood.",
        "duration": "3"
      },
      {
        "index": 5,
        "prompt": "A man slipping on a banana peel, shocked expression. Exaggerated pose, bright colors.",
        "duration": "3"
      },
      {
        "index": 6,
        "prompt": "A sunset over mountains, small figure walking away. Wide angle, peaceful atmosphere.",
        "duration": "1"
      }
    ],
    "image_list": [],
    "sound":"on",
    "element_list": [],
    "video_list": [],
    "mode": "pro",
    "aspect_ratio": "16:9",
    "duration": "15",
    "callback_url": "xxx",
    "external_task_id": ""
  }'
```

## 2. 查询任务（单个）
### 2.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/videos/omni-video/{id} |
| 请求方法 | GET |
| 请求格式 | application/json |
| 响应格式 | application/json |

### 2.2 请求头
| 字段 | 值 | 描述 |
|-----|-----|-----|
| Content-Type | application/json | 数据交换格式 |
| Authorization | 鉴权信息，参考接口鉴权 | 鉴权信息，参考接口鉴权 |

### 2.3 请求路径参数
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| task_id | string | 可选 | 空 | 文生视频的任务ID<br>● 请求路径参数，直接将值填写在请求路径中，与external_task_id两种查询方式二选一 |
| external_task_id | string | 可选 | 空 | 文生视频的自定义任务ID<br>● 创建任务时填写的external_task_id，与task_id两种查询方式二选一 |

### 2.4 请求体
无

### 2.5 响应体
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
          "url": "string", //生成视频的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
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

## 3. 查询任务（列表）
### 3.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/videos/omni-video |
| 请求方法 | GET |
| 请求格式 | application/json |
| 响应格式 | application/json |

### 3.2 请求头
| 字段 | 值 | 描述 |
|-----|-----|-----|
| Content-Type | application/json | 数据交换格式 |
| Authorization | 鉴权信息，参考接口鉴权 | 鉴权信息，参考接口鉴权 |

### 3.3 查询参数
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| pageNum | int | 可选 | 1 | 页码<br>● 取值范围：[1,1000] |
| pageSize | int | 可选 | 30 | 每页数据量<br>● 取值范围：[1,500] |

### 3.4 请求体
无

### 3.5 响应体
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
            "url": "string", //生成视频的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
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