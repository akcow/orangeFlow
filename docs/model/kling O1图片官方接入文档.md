

---

# Omni-Image API 说明文档
## 1. 创建任务
### 1.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/images/omni-image |
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
| model_name | string | 可选 | kling-image-o1 | 模型名称<br>● 枚举值：kling-image-o1，kling-v3-omni |
| prompt | string | 必须 | 无 | 文本提示词，可包含正向描述和负向描述<br>● 可将提示词模板化来满足不同的图像生成需求<br>● 不能超过2500个字符<br>Omni模型可通过Prompt与图片等内容实现多种能力：<br>1. 通过<<<>>>的格式来指定某个图片，如：<<<image_1>>><br>2. 能力范围详见使用手册：可灵Omni模型使用指南 |
| image_list | array | 可选 | 空 | 参考图列表<br>● 数据结构示例：<br>```json<br>"image_list":[<br>  {<br>    "image":"image_url"<br>  },<br>  {<br>    "image":"image_url"<br>  }<br>]<br>```<br>● 支持传入图片Base64编码或图片URL（确保可访问）<br>● 图片格式支持.jpg / .jpeg / .png<br>● 图片文件大小不能超过10MB，图片宽高尺寸不小于300px，图片宽高比要在1:2.5 ~ 2.5:1之间<br>● 参考主体数量与参考图片数量有关，参考主体数量和参考图片数量之和不得超过10<br>● image参数值不得为空 |
| element_list | array | 可选 | 空 | 主体参考列表<br>● 基于主体库中主体的ID配置，数据结构示例：<br>```json<br>"element_list":[<br>  {<br>    "element_id":long<br>  }<br>]<br>```<br>● 参考主体数量与参考图片数量有关，参考主体数量和参考图片数量之和不得超过10 |
| resolution | string | 可选 | 1k | 生成图片的清晰度<br>● 枚举值：1k, 2k, 4k<br>  ○ 1k：1K标清<br>  ○ 2k：2K高清<br>  ○ 4k：4K高清<br>不同模型版本支持范围不同，详见上文能力地图 |
| result_type | string | 可选 | single | 生成结果单图/组图切换开关<br>● 枚举值：single，series<br>不同模型版本支持范围不同，详见上文能力地图 |
| n | int | 可选 | 1 | 生成图片数量<br>● 取值范围：[1,9]<br>● 当result_type值为series时，当前参数无效 |
| series_amount | int | 可选 | 4 | 生成组图的图片数量<br>● 取值范围：[2, 9]<br>● 当result_type值为single时，当前参数无效<br>不同模型版本支持范围不同，详见上文能力地图 |
| aspect_ratio | string | 可选 | auto | 生成图片的画面纵横比（宽:高）<br>● 枚举值：16:9, 9:16, 1:1, 4:3, 3:4, 3:2, 2:3, 21:9, auto<br>  ○ 其中：auto为根据传入内容智能生成图片<br>● 参考原图横纵比生成新图时，当前参数无效<br>不同模型版本支持范围不同，详见上文能力地图 |
| watermark_info | array | 可选 | 空 | 是否同时生成含水印的结果<br>● 通过enabled参数定义，数据结构示例：<br>```json<br>"watermark_info": {<br>  "enabled": boolean // true 为生成，false 为不生成<br>}<br>```<br>● 暂不支持自定义水印 |
| callback_url | string | 可选 | 无 | 本次任务结果回调通知地址，如果配置，服务端会在任务状态发生变更时主动通知<br>● 具体通知的消息schema见“Callback协议” |
| external_task_id | string | 可选 | 无 | 自定义任务ID<br>● 用户自定义任务ID，传入不会覆盖系统生成的任务ID，但支持通过该ID进行任务查询<br>● 请注意，单用户下需要保证唯一性 |

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
#### 示例：引入主体生成图像
```bash
curl --location 'https://xxx/v1/images/generations' \
--header 'Authorization: Bearer xxx' \
--header 'Content-Type: application/json' \
--data '{
    "model_name": "kling-v3-omni",
    "prompt": "Generate a recommended cover for each subject <<object_1>> based on the style of the reference image <<image_1>>",
    "element_list": [
      {
        "element_id": "160"
      },
      {
        "element_id": "161"
      }
    ],
    "image_list": [
      {
        "image": "xxx"
      },
      {
        "image": "xxx"
      }
    ],
    "resolution": "2k",
    "result_type": "series",
    "series_amount": 2,
    "aspect_ratio": "auto",
    "external_task_id": "",
    "callback_url": ""
  }'
```

## 2. 查询任务（单个）
### 2.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/images/omni-image/{id} |
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
    "task_info": { //任务创建时的参数信息
      "external_task_id": "string"//客户自定义任务ID
    },
    "task_result":{
      "result_type": "single",
      "images":[
        {
          "index": int, //图片编号
          "url": "string" //生成图片的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "watermark_url": "string", // 含水印图片下载URL，防盗链格式
        }
      ],
      "series_images":[
        {
          "index": int, //组图序号
          "url": "string" //生成图片的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "watermark_url": "string", // 含水印图片下载URL，防盗链格式
        }
      ]
    },
    "final_unit_deduction": "string", // 任务最终扣减积分数值
    "watermark_info": {
      "enabled": boolean
    }, 
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
| 请求地址 | /v1/images/omni-image |
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
        "external_task_id": "string"//客户自定义任务ID
      },
      "task_result":{
        "result_type": "single",
        "images":[
          {
            "index": int, //图片编号
            "url": "string" //生成图片的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
            "watermark_url": "string", // 含水印图片下载URL，防盗链格式
          }
        ],
        "series_images":[
          {
            "index": int, //组图序号
            "url": "string" //生成图片的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
            "watermark_url": "string", // 含水印图片下载URL，防盗链格式
          }
        ]
      },
      "final_unit_deduction": "string", // 任务最终扣减积分数值
      "watermark_info": {
        "enabled": boolean
      }, 
      "created_at": 1722769557708, //任务创建时间，Unix时间戳、单位ms
      "updated_at": 1722769557708 //任务更新时间，Unix时间戳、单位ms
    }
  ]
}
```

---
