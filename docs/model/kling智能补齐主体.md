你希望将【智能补全主体图】相关的三个API（创建任务、查询单个任务、查询任务列表）整理成规范的Markdown格式文档，我已按照和之前一致的API文档规范完成整理，完整保留所有参数约束、调用示例和响应结构，同时修正原文不完整的内容并优化格式可读性。

---

# 智能补全主体图 API 说明文档
## 1. 创建任务
### 1.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/general/ai-multi-shot |
| 请求方法 | POST |
| 请求格式 | application/json |
| 响应格式 | application/json |

### 1.2 请求头
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| Content-Type | string | 必须 | application/json | 数据交换格式 |
| Authorization | string | 必须 | 无 | 鉴权信息，参考接口鉴权 |

### 1.3 请求体参数
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| element_frontal_image | string | 必须 | 无 | 主体正面参考图<br>● 支持传入图片Base64编码或图片URL（确保可访问）<br>● 图片格式支持.jpg / .jpeg / .png<br>● 图片文件大小不能超过10MB，图片宽高尺寸不小于300px，图片宽高比要在1:2.5 ~ 2.5:1之间 |
| callback_url | string | 可选 | 无 | 本次任务结果回调通知地址，如果配置，服务端会在任务状态发生变更时主动通知<br>● 具体通知的消息schema见 Callback协议 |
| external_task_id | string | 可选 | 无 | 自定义任务ID<br>● 用户自定义任务ID，传入不会覆盖系统生成的任务ID，但支持通过该ID进行任务查询<br>● 请注意，单用户下需要保证唯一性 |

### 1.4 响应体
```json
{
  "code": 0, // 错误码；具体定义见错误码
  "message": "string", // 错误信息
  "request_id": "string", // 请求ID，系统生成，用于跟踪请求、排查问题
  "data": {
    "task_id": "string", // 任务ID，系统生成
    "task_status": "string", // 任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
    "task_info": { //任务创建时的参数信息
      "external_task_id": "string" //客户自定义任务ID
    },
    "created_at": 1722769557708, // 任务创建时间，Unix时间戳、单位ms
    "updated_at": 1722769557708 //任务更新时间，Unix时间戳、单位ms
  }
}
```

### 1.5 调用示例
```bash
curl --request POST \
  --url https://api-beijing.klingai.com/v1/general/ai-multi-shot \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '{
    "element_frontal_image": "https://v1-kling.klingai.com/kcdn/cdn-kcdn112452/kling-qa-test/multi-1.png",
    "external_task_id": "",
    "callback_url": ""
  }'
```

## 2. 查询任务（单个）
### 2.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/general/ai-multi-shot/{id} |
| 请求方法 | GET |
| 请求格式 | application/json |
| 响应格式 | application/json |

### 2.2 请求头
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| Content-Type | string | 必须 | application/json | 数据交换格式 |
| Authorization | string | 必须 | 无 | 鉴权信息，参考接口鉴权 |

### 2.3 请求路径参数
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| task_id | string | 可选 | 无 | 任务ID<br>● 请求路径参数，直接将值填写在请求路径中<br>● 与external_task_id两种查询方式二选一 |
| external_task_id | string | 可选 | 无 | 自定义任务ID<br>● 请求路径参数，直接将值填写在请求路径中<br>● 与task_id两种查询方式二选一 |

### 2.4 请求体
无

### 2.5 响应体
```json
{
  "code": 0, // 错误码；具体定义见错误码
  "message": "string", // 错误信息
  "request_id": "string", // 请求ID，系统生成，用于跟踪请求、排查问题
  "data": {
    "task_id": "string", // 任务ID，系统生成
    "task_status": "string", // 任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
    "task_status_msg": "string", // 任务状态信息，当任务失败时展示失败原因（如触发平台的内容风控等）
    "final_unit_deduction": "string", // 任务最终扣减积分数值
    "created_at": 1722769557708, // 任务创建时间，Unix时间戳、单位ms
    "updated_at": 1722769557708, // 任务更新时间，Unix时间戳、单位ms
    "task_result": {
      "images": [
        {
          "index": 0, // 图片编号，0-9
          "url": "string" //生成图片的URL，例如：https://h1.inkwai.com/bs2/upload-ylab-stunt/1fa0ac67d8ce6cd55b50d68b967b3a59.png（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
        }
      ]
    }
  }
}
```

### 2.6 调用示例
```bash
curl --request GET \
  --url https://api-beijing.klingai.com/v1/general/ai-multi-shot/{task_id} \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json'
```

## 3. 查询任务（列表）
### 3.1 基础信息
| 项⽬ | 值 |
|-----|-----|
| 网络协议 | https |
| 请求地址 | /v1/general/ai-multi-shot |
| 请求方法 | GET |
| 请求格式 | application/json |
| 响应格式 | application/json |

### 3.2 请求头
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| Content-Type | string | 必须 | application/json | 数据交换格式 |
| Authorization | string | 必须 | 无 | 鉴权信息，参考接口鉴权 |

### 3.3 查询参数
| 字段 | 类型 | 必填 | 默认值 | 描述 |
|-----|-----|-----|-----|-----|
| pageNum | int | 可选 | 1 | 页码<br>● 取值范围：[1, 1000] |
| pageSize | int | 可选 | 30 | 每页数据量<br>● 取值范围：[1, 500] |

### 3.4 请求体
无

### 3.5 响应体
```json
{
  "code": 0, // 错误码；具体定义见错误码
  "message": "string", // 错误信息
  "request_id": "string", // 请求ID，系统生成，用于跟踪请求、排查问题
  "data": [
    {
      "task_id": "string", // 任务ID，系统生成
      "task_status": "string", // 任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
      "task_status_msg": "string", // 任务状态信息，当任务失败时展示失败原因（如触发平台的内容风控等）
      "task_info": { //任务创建时的参数信息
        "external_task_id": "string" //客户自定义任务ID
      },
      "task_result": {
        "images": [
          {
            "index": 0, // 图片结果编号，0-2
            "url_1": "string", // 生成图片的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
            "url_2": "string", // 生成图片的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
            "url_3": "string" //生成图片的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          }
        ]
      },
      "final_unit_deduction": "string", // 任务最终扣减积分数值
      "created_at": 1722769557708, // 任务创建时间，Unix时间戳、单位ms
      "updated_at": 1722769557708 //任务更新时间，Unix时间戳、单位ms
    }
  ]
}
```

### 3.6 调用示例
```bash
curl --request GET \
  --url 'https://api-beijing.klingai.com/v1/general/ai-multi-shot?pageNum=1&pageSize=30' \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json'
```

---