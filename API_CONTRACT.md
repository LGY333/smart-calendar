# 前后端接口约定草案

后端由其他同学负责，前端只依赖这些接口。建议先约定稳定字段，再各自开发。

## 1. AI 对话 / 语音

`POST /api/agent/chat`

请求：
```json
{
  "message": "明天下午 3 点开会，1 小时",
  "mode": "text",
  "context": {
    "selectedDate": "2026-09-15"
  }
}
```

响应：
```json
{
  "reply": "已为你创建任务：开会",
  "draft": {
    "title": "开会",
    "date": "2026-09-16",
    "start": "15:00",
    "end": "16:00",
    "priority": "中",
    "reminder": "none",
    "tags": []
  },
  "actions": ["create_task"]
}
```

## 2. 自然语言解析

`POST /api/agent/parse`

请求：
```json
{
  "text": "明天下午 3 点和产品评审，1 小时，提前 10 分钟提醒，重要"
}
```

响应：
```json
{
  "title": "产品评审",
  "date": "2026-09-16",
  "start": "15:00",
  "end": "16:00",
  "priority": "高",
  "reminder": "10",
  "tags": []
}
```

## 3. 自动排程

`POST /api/schedule/plan`

请求：
```json
{
  "items": ["论文", "健身", "开会"],
  "deadline": "2026-09-21",
  "existingTasks": []
}
```

响应：
```json
{
  "plan": [
    {
      "title": "论文",
      "date": "2026-09-15",
      "start": "14:00",
      "end": "15:00",
      "priority": "高"
    }
  ]
}
```

## 4. 目标倒推

`POST /api/goals/plan`

请求：
```json
{
  "title": "12月通过六级英语考试",
  "deadline": "2026-12-15",
  "dailyMinutes": 90,
  "availableAfter": "20:00"
}
```

响应：
```json
{
  "stages": [
    { "name": "诊断期", "start": 1, "end": 10 }
  ],
  "dailyTasks": []
}
```

## 5. 外部数据

前端只调用后端，不直接访问外部服务：

- `GET /api/weather`
- `GET /api/canteens?location=`
- `GET /api/health/recommend`

## 联调建议

- 所有接口统一返回 `{ code, message, data }` 或至少稳定字段名。
- 失败时前端展示可理解的错误，不使用未格式化的原始异常。
- 语音模式可以复用 `POST /api/agent/chat`，前端负责识别和播放。
