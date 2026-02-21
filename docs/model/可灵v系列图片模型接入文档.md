你希望将【图像生成】相关的三个API（创建任务、查询单个任务、查询任务列表）的说明文档转换成规范、易读的Markdown格式，我已按照统一的API文档规范为你整理完成，保留了所有关键参数约束、示例和特殊规则说明。

---

# 图像生成 API 说明文档
## 1. 创建任务
### 1.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/images/generations |
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
| model_name | string | 可选 | kling-v1 | 模型名称<br>● 枚举值：kling-v1, kling-v1-5, kling-v2, kling-v2-new, kling-v2-1, kling-v3 |
| prompt | string | 必须 | 无 | 文本提示词，可包含正向描述和负向描述<br>● 不能超过2500个字符 |
| negative_prompt | string | 可选 | 空 | 负向文本提示词<br>● 不能超过2500个字符<br>● 建议将负向提示词用否定描述的方式写入正向提示词中<br>注：图生图（即image字段不为空时）场景下，不支持负向提示词 |
| image | string | 可选 | 空 | 参考图片<br>● 支持传入图片Base64编码或图片URL（确保可访问）<br>请注意，若您使用base64的方式，请确保您传递的所有图像数据参数均采用Base64编码格式。在提交数据时，请不要在Base64编码字符串前添加任何前缀，例如data:image/png;base64,。正确的参数格式应该直接是Base64编码后的字符串。<br>示例：<br>正确的Base64编码参数：<br>iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==<br>错误的Base64编码参数（包含data:前缀）：<br>data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==<br>请仅提供Base64编码的字符串部分，以便系统能够正确处理和解析您的数据。<br>● 图片格式支持.jpg / .jpeg / .png<br>● 图片文件大小不能超过10MB，图片宽高尺寸不小于300px，图片宽高比介于1:2.5 ~ 2.5:1之间<br>● image_reference参数不为空时，当前参数必填 |
| element_list | array | 可选 | 空 | 主体参考列表<br>● 基于主体库中主体的ID配置，数据结构示例：<br>```json<br>"element_list":[<br>  {<br>    "element_id":long<br>  },<br>  {<br>    "element_id":long<br>  }<br>]<br>```<br>● 参考主体数量与参考图片数量有关，参考主体数量和参考图片数量之和不得超过10 |
| resolution | string | 可选 | 1k | 生成图片的清晰度<br>● 枚举值：1k, 2k<br>  ○ 1k：1K标清<br>  ○ 2k：2K高清<br>不同模型版本支持范围不同，详见上文能力地图 |
| n | int | 可选 | 1 | 生成图片数量<br>● 取值范围：[1,9] |
| aspect_ratio | string | 可选 | 16:9 | 生成图片的画面纵横比（宽:高）<br>● 枚举值：16:9, 9:16, 1:1, 4:3, 3:4, 3:2, 2:3, 21:9<br>不同模型版本支持范围不同，详见上文能力地图 |
| watermark_info | array | 可选 | 空 | 是否同时生成含水印的结果<br>● 通过enabled参数定义，数据结构示例：<br>```json<br>"watermark_info": {<br>  "enabled": boolean // true 为生成，false 为不生成<br>}<br>```<br>● 暂不支持自定义水印 |
| callback_url | string | 可选 | 无 | 本次任务结果回调通知地址，如果配置，服务端会在任务状态发生变更时主动通知<br>● 具体通知的消息schema见“Callback协议” |
| external_task_id | string | 可选 | 无 | 自定义任务ID<br>● 用户自定义任务ID，传入不会覆盖系统生成的任务ID，但支持通过该ID进行任务查询<br>● 请注意，单用户下需要保证唯一性 |

### 1.4 响应体
```json
{
  "code": 0, //错误码；具体定义错误码
  "message": "string", //错误信息
  "request_id": "string", //请求ID，系统生成，用于跟踪请求、排查问题
  "data":{
    "task_id": "string", //任务ID，系统生成
    "task_status": "string", //任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
    "task_info":{ //任务创建时的参数信息
       "external_task_id": "string"//自定义任务ID
    },
    "created_at": 1722769557708, //任务创建时间，Unix时间戳、单位ms
    "updated_at": 1722769557708 //任务更新时间，Unix时间戳、单位ms
  }
}
```

### 1.5 调用示例
#### 示例：引入主体生成图像
```bash
curl --location 'https://xxx/v1/images/generations' \
--header 'Authorization: Bearer xxx' \
--header 'Content-Type: application/json' \
--data '{
    "model_name": "kling-v3",
    "prompt": "Merge all the characters from the images into the <<<object_2>>> diagram",
    "element_list": [
        {
            "element_id": "160"
        },
        {
            "element_id": "161"
        },
        {
            "element_id": "159"
        }
    ],
    "image": "xxx",
    "resolution": "2k",
    "n": "9",
    "aspect_ratio": "3:2",
    "external_task_id": "",
    "callback_url": ""
}'
```

## 2. 查询任务（单个）
### 2.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/images/generations/{id} |
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
| task_id | string | 必须 | 无 | 图片生成的任务ID<br>● 请求路径参数，直接将值填写在请求路径中 |
| external_task_id | string | 可选 | 无 | 自定义任务ID<br>● 创建任务时填写的external_task_id，与task_id两种查询方式二选一 |

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
    "final_unit_deduction": "string", // 任务最终扣减积分数值
    "watermark_info": {
      "enabled": boolean
    },
    "created_at": 1722769557708, //任务创建时间，Unix时间戳、单位ms
    "updated_at": 1722769557708, //任务更新时间，Unix时间戳、单位ms
    "task_result":{
      "images":[
        {
          "index": int, //图片编号，0-9
          "url": "string" //生成图片的URL，例如：https://h1.inkwai.com/bs2/upload-ylab-stunt/1fa0ac67d8ce6cd55b50d68b967b3a59.png（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "watermark_url": "string", // 含水印图片下载URL，防盗链格式
        }
      ]
    },
    "task_info":{ //任务创建时的参数信息
      "external_task_id": "string"//自定义任务ID
    }
  }
}
```

## 3. 查询任务（列表）
### 3.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/images/generations |
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
      "final_unit_deduction": "string", // 任务最终扣减积分数值
      "watermark_info": {
        "enabled": boolean
      }, 
      "created_at": 1722769557708, //任务创建时间，Unix时间戳、单位ms
      "updated_at": 1722769557708, //任务更新时间，Unix时间戳、单位ms
      "task_result":{
        "images":[
          {
            "index": int, //图片编号，0-9
            "url": "string" //生成图片的URL，例如：https://h1.inkwai.com/bs2/upload-ylab-stunt/1fa0ac67d8ce6cd55b50d68b967b3a59.png（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
            "watermark_url": "string", // 含水印图片下载URL，防盗链格式
          }
        ]
      },
      "task_info":{ //任务创建时的参数信息
         "external_task_id": "string"//自定义任务ID
      }
    }
  ]
}
```

---