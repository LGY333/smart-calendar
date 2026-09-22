#!/usr/bin/env python3
"""智能日历后端：静态文件服务 + AI 排程接口。

运行：
    python server.py

配置 AI 的方式（二选一，环境变量优先）：
    1. 在本目录新建 config.json，写入 api_key / base_url / model。
    2. 使用环境变量 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL。

未配置 API Key 时，使用服务端规则降级生成计划草案。
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8000"))
DIST_ROOT = os.path.join(ROOT, "dist")


def _load_config() -> dict:
    """读取 config.json，失败时返回空配置。"""
    config_path = os.path.join(ROOT, "config.json")
    if not os.path.isfile(config_path):
        return {}
    try:
        with open(config_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
            return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _llm_config() -> dict:
    """合并环境变量与 config.json，环境变量优先。"""
    config = _load_config()
    api_key = os.environ.get("LLM_API_KEY") or config.get("api_key") or ""
    base_url = os.environ.get("LLM_BASE_URL") or config.get("base_url") or "https://api.deepseek.com/v1"
    model = os.environ.get("LLM_MODEL") or config.get("model") or "deepseek-chat"
    return {"api_key": api_key.strip(), "base_url": base_url.rstrip("/"), "model": model.strip()}


SYSTEM_PROMPT = """你是智能日历中的语音排程助手。用户会用自然语言让你创建计划。你的任务是理解意图、生成计划草案，并询问是否加入日历。
你支持任意计划类型，不限于备考。包括：备考、考研、健身、减脂、旅行、项目开发、读书、习惯养成、工作安排、学习技能等。

规则：
1. 先理解，再确认，最后写入。
2. 任何创建、修改、删除日程的操作，必须先复述摘要并询问确认。
3. 只有用户明确说"加入 / 确认 / 可以 / 排进去 / 加到日历"后，才允许写入。
4. 如果信息不足，最多追问 3 个关键问题：起止时间、每天可用时间、偏好时段、频率。
5. 如果用户说"默认"，按计划类型给合理默认，不要所有计划都套"学习/考试"。
6. 根据计划类型动态生成阶段和事件：
   - 备考：基础、强化、冲刺、模考、错题复盘。
   - 健身：力量、有氧、拉伸、休息、饮食记录。
   - 旅行：交通、住宿、景点、餐饮、预算。
   - 项目：需求、设计、开发、测试、上线、复盘。
   - 读书：每天页数、章节、笔记、总结。
7. 不要安排过满，每天最多 1-2 个相关事件。
8. 回复要简洁，适合语音播报。
9. 如果无法判断计划类型，先问用户："这是哪类计划？希望安排在什么时间段？"
10. 事件总数最多 30 个。如果时间跨度较大，按每周 2-3 次的节奏间隔安排，不要每天都排。
11. 当用户提到"六级/考研/期末/雅思"等学习目标时，必须进行知识模块拆解，按遗忘曲线（1/2/4/7/15 天间隔）安排复习。
12. 如果用户提供了知识库内容，必须基于知识库生成复习重点和错题复盘计划，优先覆盖知识库中的章节和薄弱点。

你必须只返回一个 JSON 对象，不要输出 markdown 代码块，不要输出多余文字。格式如下：
{
  "intent": "create_plan",
  "reply": "我为你生成了备考12月六级计划，共24个日程，从9月18日到12月19日。要加入日历吗？",
  "need_confirmation": true,
  "diagnosis": {
    "modules": [
      { "name": "听力", "focus": "精听错题、信号词" },
      { "name": "阅读", "focus": "同义替换、快速定位" },
      { "name": "写作", "focus": "三段式模板、高频句型" },
      { "name": "翻译", "focus": "中国文化表达、长句拆分" }
    ],
    "strategy": "按遗忘曲线在 1/2/4/7/15 天间隔复习"
  },
  "plan": {
    "title": "备考12月六级计划",
    "start_date": "2026-09-18",
    "end_date": "2026-12-19",
    "events": [
      {
        "title": "六级备考：听力精听",
        "start": "2026-09-18T19:30:00+08:00",
        "end": "2026-09-18T20:30:00+08:00",
        "description": "完成一套听力真题，精听错题部分",
        "reminder_minutes": 10,
        "category": "学习"
      }
    ]
  }
}

日期时间必须使用带 +08:00 时区的 ISO 8601 格式。"""


MATERIALS_PROMPT = """你是学习资料生成助手。根据任务类型生成当日学习物料。

任务类型规则：
1. "背单词"：生成今日词汇表，10 个高频词，包含单词、音标、中文释义、英文例句。
2. "做真题"：生成 3-5 道模拟题，包含题干、选项、正确答案、解析。
3. "考研复习"或"知识框架"：生成知识框架思维导图，树状结构，3 层以内。
4. "看课件"或"读书"：生成核心摘要（4 条要点）和重点问题（4 个问题）。
5. 其他学习任务：生成对应的学习要点清单。

只返回一个 JSON 对象，不要 markdown，不要多余文字。

背单词格式：
{"task_type":"背单词","title":"今日词汇表","content":{"words":[{"word":"...","phonetic":"...","meaning":"...","example":"..."}]}}

做真题格式：
{"task_type":"做真题","title":"六级模拟题","content":{"questions":[{"question":"...","options":["A","B","C","D"],"answer":"A","analysis":"..."}]}}

知识框架格式：
{"task_type":"知识框架","title":"考研数学框架","content":{"tree":{"name":"考研数学","children":[{"name":"高等数学","children":[{"name":"极限"},{"name":"导数"}]},{"name":"线性代数","children":[]}]}}}}

看课件格式：
{"task_type":"看课件","title":"核心摘要与重点问题","content":{"summary":{"points":["要点1","要点2","要点3","要点4"],"keyQuestions":["问题1","问题2","问题3","问题4"]}}}
"""


TUTOR_PROMPT = """你是大学生的 AI 学习导师。学生会在学习过程中向你提问、求助或咨询规划。

你的职责：
1. 解答学习问题，给出具体、可操作的建议。
2. 根据学生的目标、薄弱点、进度，动态调整学习计划。
3. 语气简洁、温暖、鼓励，像一位耐心的私人教务长。
4. 回答控制在 150 字以内，适合快速阅读。
5. 不要编造知识点，不确定的内容建议学生查阅教材或官方资料。

只返回一个 JSON 对象，格式如下：
{"reply":"你的回答内容"}
"""


def _parse_json_from_text(text: str) -> dict | None:
    """从模型输出中稳健提取 JSON 对象。"""
    if not text:
        return None
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.IGNORECASE)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


def _call_llm(
    message: str,
    context: dict,
    system_prompt: str | None = None,
    temperature: float = 0.3,
) -> tuple[dict | None, str | None]:
    """调用 OpenAI 兼容接口。返回 (结果, 错误信息)。"""
    config = _llm_config()
    if not config["api_key"]:
        return None, "no_key"

    url = config["base_url"] + "/chat/completions"

    user_content = {
        "用户输入": message,
        "当前日期": context.get("today"),
        "用户时区": context.get("timezone", "Asia/Shanghai"),
        "已有日程摘要": context.get("existing_events", []),
        "知识库内容": context.get("knowledge", ""),
        "用户偏好": context.get("preferences", {}),
    }

    payload = {
        "model": config["model"],
        "temperature": temperature,
        "max_tokens": 8000,
        "messages": [
            {"role": "system", "content": system_prompt or SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(user_content, ensure_ascii=False)},
        ],
    }
    # 部分兼容接口需要该参数强制 JSON；失败时不影响，提示词已强制 JSON。
    payload["response_format"] = {"type": "json_object"}

    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + config["api_key"],
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        try:
            detail = json.loads(body).get("error", {}).get("message", body[:300])
        except json.JSONDecodeError:
            detail = body[:300]
        return None, f"HTTP {exc.code}: {detail}"
    except urllib.error.URLError as exc:
        return None, f"网络错误：{exc.reason}"
    except json.JSONDecodeError:
        return None, "接口返回的不是 JSON"

    content = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    result = _parse_json_from_text(content)
    if not result:
        return None, "模型输出无法解析为 JSON"
    return result, None


def _today() -> datetime:
    return datetime.now()


def _add_days(date: datetime, days: int) -> datetime:
    return date + timedelta(days=days)


def _iso(date: datetime, hour: int, minute: int) -> str:
    return date.replace(hour=hour, minute=minute, second=0, microsecond=0).isoformat() + "+08:00"


def _plan_type(message: str) -> str:
    lowered = message.lower()
    if re.search(r"考研|六级|四级|英语|备考|考试|复习|雅思|托福", lowered):
        return "study"
    if re.search(r"健身|减脂|增肌|跑步|运动|锻炼", lowered):
        return "fitness"
    if re.search(r"旅行|旅游|出差|去.{0,6}(玩|游)", lowered):
        return "travel"
    if re.search(r"项目|开发|上线|需求|迭代", lowered):
        return "project"
    if re.search(r"读书|阅读|看完|一本书", lowered):
        return "reading"
    if re.search(r"习惯|早起|喝水|打卡", lowered):
        return "habit"
    if re.search(r"工作|开会|日程|安排", lowered):
        return "work"
    return "general"


def _target_end(message: str) -> datetime:
    today = _today()
    month_match = re.search(r"(\d{1,2})\s*月", message)
    if month_match:
        month = int(month_match.group(1))
        year = today.year
        if month < today.month:
            year += 1
        if month == 12:
            return datetime(year, 12, 19, 23, 59, 59)
        return datetime(year, month, min(28, 19), 23, 59, 59)
    week_match = re.search(r"(\d+)\s*周", message)
    if week_match:
        return _add_days(today, int(week_match.group(1)) * 7)
    day_match = re.search(r"(\d+)\s*天", message)
    if day_match:
        return _add_days(today, int(day_match.group(1)))
    if "本周" in message:
        return _add_days(today, 7)
    return _add_days(today, 30)


def _rule_based_plan(message: str, context: dict) -> dict:
    today = _today()
    plan_type = _plan_type(message)
    end = _target_end(message)
    total_days = max(1, (end.date() - today.date()).days + 1)

    if plan_type == "travel":
        days = min(total_days, 7)
        title = "旅行计划"
        events = []
        labels = ["确认交通与住宿", "游览核心景点", "品尝当地美食", "自由活动与拍照", "返程与行李整理"]
        for offset in range(days):
            day = _add_days(today, offset)
            events.append(
                {
                    "title": f"旅行：{labels[offset % len(labels)]}",
                    "start": _iso(day, 9, 0),
                    "end": _iso(day, 11, 0),
                    "description": "按计划推进行程",
                    "reminder_minutes": 30,
                    "category": "旅行",
                }
            )
        start_date = today.date().isoformat()
        end_date = _add_days(today, days - 1).date().isoformat()
        reply = f"我为你生成了旅行计划，共 {len(events)} 个日程，从 {start_date} 到 {end_date}。要加入日历吗？"
        return _make_plan_result(reply, title, start_date, end_date, events)

    templates = {
        "study": {
            "title": "备考计划",
            "category": "学习",
            "phases": ["基础知识梳理", "专项强化训练", "真题模拟练习", "错题复盘总结"],
        },
        "fitness": {
            "title": "健身减脂计划",
            "category": "运动",
            "phases": ["有氧燃脂训练", "力量训练", "拉伸与恢复", "饮食记录"],
        },
        "project": {
            "title": "项目推进计划",
            "category": "工作",
            "phases": ["需求拆解", "核心开发", "联调测试", "上线复盘"],
        },
        "reading": {
            "title": "读书计划",
            "category": "学习",
            "phases": ["章节阅读", "读书笔记", "要点总结"],
        },
        "habit": {
            "title": "习惯养成计划",
            "category": "生活",
            "phases": ["每日执行", "阶段复盘"],
        },
        "work": {
            "title": "工作安排计划",
            "category": "工作",
            "phases": ["重点任务处理", "进度回顾"],
        },
        "general": {
            "title": "计划",
            "category": "生活",
            "phases": ["阶段推进", "复盘调整"],
        },
    }
    template = templates[plan_type]
    phases = template["phases"]
    title = template["title"]
    category = template["category"]

    events = []
    interval = max(1, total_days // 12)
    cursor = 0
    while cursor < total_days and len(events) < 24:
        day = _add_days(today, cursor)
        phase = phases[(cursor // max(1, interval)) % len(phases)]
        events.append(
            {
                "title": f"{title}：{phase}",
                "start": _iso(day, 19, 30),
                "end": _iso(day, 20, 30),
                "description": phase,
                "reminder_minutes": 10,
                "category": category,
            }
        )
        cursor += interval

    start_date = today.date().isoformat()
    end_date = end.date().isoformat()
    reply = f"我为你生成了{title}，共 {len(events)} 个日程，从 {start_date} 到 {end_date}。要加入日历吗？"
    return _make_plan_result(reply, title, start_date, end_date, events)


def _make_plan_result(reply: str, title: str, start_date: str, end_date: str, events: list) -> dict:
    return {
        "intent": "create_plan",
        "reply": reply,
        "need_confirmation": True,
        "plan": {
            "title": title,
            "start_date": start_date,
            "end_date": end_date,
            "events": events,
        },
    }


def _handle_agent(payload: dict) -> dict:
    message = (payload.get("message") or "").strip()
    context = payload.get("context") or {}
    if not message:
        return {"intent": "clarify", "reply": "你想安排什么计划？", "need_confirmation": False}

    llm_result, llm_error = _call_llm(message, context)
    if llm_result and llm_result.get("intent"):
        return llm_result
    if llm_error and llm_error != "no_key":
        return {
            "intent": "error",
            "reply": "AI 调用失败：" + llm_error,
            "need_confirmation": False,
        }
    return _rule_based_plan(message, context)


def _rule_based_materials(task_type: str, topic: str) -> dict:
    """无 API Key 时的学习物料降级生成。"""
    if "单词" in task_type or "词汇" in task_type:
        return {
            "task_type": "背单词",
            "title": topic + "今日词汇表" if topic else "今日词汇表",
            "content": {
                "words": [
                    {"word": "abandon", "phonetic": "/əˈbændən/", "meaning": "放弃；抛弃", "example": "Never abandon your dream."},
                    {"word": "acquire", "phonetic": "/əˈkwaɪər/", "meaning": "获得；习得", "example": "We acquire knowledge through reading."},
                    {"word": "assess", "phonetic": "/əˈses/", "meaning": "评估；评定", "example": "Teachers assess students' progress."},
                    {"word": "consequence", "phonetic": "/ˈkɒnsɪkwəns/", "meaning": "结果；后果", "example": "Every choice has a consequence."},
                    {"word": "evaluate", "phonetic": "/ɪˈvæljueɪt/", "meaning": "评价；评估", "example": "We evaluate the plan carefully."},
                ]
            },
        }
    if "真题" in task_type or "模拟" in task_type:
        return {
            "task_type": "做真题",
            "title": topic + "模拟题" if topic else "模拟题",
            "content": {
                "questions": [
                    {
                        "question": "The project was completed ahead of ____.",
                        "options": ["schedule", "schedules", "scheduling", "scheduled"],
                        "answer": "A",
                        "analysis": "ahead of schedule 是固定搭配，表示提前。",
                    },
                    {
                        "question": "Which word is closest in meaning to \"essential\"?",
                        "options": ["optional", "vital", "minor", "extra"],
                        "answer": "B",
                        "analysis": "essential 表示必要的，与 vital 同义。",
                    },
                ]
            },
        }
    if "课件" in task_type or "读书" in task_type or "阅读" in task_type:
        return {
            "task_type": "看课件",
            "title": topic + "核心摘要" if topic else "核心摘要与重点问题",
            "content": {
                "summary": {
                    "points": [
                        "掌握本章核心概念与定义",
                        "理解公式推导过程而非死记硬背",
                        "结合例题掌握解题思路",
                        "标注常见易错点和边界条件",
                    ],
                    "keyQuestions": [
                        "本章的核心概念是什么？用自己的话复述。",
                        "公式的适用条件和推导步骤是什么？",
                        "例题的解题思路能否迁移到变式题？",
                        "哪些易错点需要特别标注？",
                    ],
                }
            },
        }
    return {
        "task_type": "知识框架",
        "title": topic + "知识框架" if topic else "知识框架",
        "content": {
            "tree": {
                "name": topic or "知识框架",
                "children": [
                    {"name": "核心概念", "children": [{"name": "定义"}, {"name": "原理"}]},
                    {"name": "重点难点", "children": [{"name": "常见题型"}, {"name": "易错点"}]},
                    {"name": "复习方法", "children": [{"name": "记忆技巧"}, {"name": "练习建议"}]},
                ],
            }
        },
    }


def _handle_materials(payload: dict) -> dict:
    task_type = (payload.get("task_type") or "").strip()
    topic = (payload.get("topic") or "").strip()
    knowledge = (payload.get("knowledge") or "").strip()
    if not task_type:
        return {"intent": "error", "reply": "缺少任务类型", "materials": None}

    message = f"任务类型：{task_type}；主题：{topic or task_type}。请生成当日学习物料。"
    if knowledge:
        message += f"\n\n以下是用户上传的知识库内容，必须基于这些内容生成学习物料：\n{knowledge[:3000]}"
    result, error = _call_llm(message, {}, MATERIALS_PROMPT, temperature=0.6)
    if result:
        return {"intent": "materials", "materials": result}
    if error and error != "no_key":
        return {"intent": "error", "reply": "AI 调用失败：" + error, "materials": None}
    return {"intent": "materials", "materials": _rule_based_materials(task_type, topic)}


def _handle_tutor(payload: dict) -> dict:
    message = (payload.get("message") or "").strip()
    if not message:
        return {"reply": "你想了解哪方面的学习问题？"}
    context = payload.get("context") or {}
    user_content = {
        "学生问题": message,
        "学习目标": context.get("goal", "通过六级"),
        "薄弱知识点": context.get("weak_points", []),
        "历史正确率": context.get("accuracy", "78%"),
        "每日可用时长": context.get("daily_hours", "2.5小时"),
    }
    result, error = _call_llm(json.dumps(user_content, ensure_ascii=False), context, TUTOR_PROMPT, temperature=0.7)
    if result and result.get("reply"):
        return result
    if error and error != "no_key":
        return {"reply": "AI 暂时不可用：" + error}
    return {
        "reply": "建议先完成今天的核心任务，再针对薄弱知识点做 2-3 道错题复盘。如果需要更具体的计划，告诉我你的目标和可用时间。"
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "SmartCalendar/1.0"

    def _send_json(self, payload: dict, status: int = 200) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _send_file(self, rel_path: str) -> None:
        if rel_path in ("", "/"):
            rel_path = "/index.html"

        path = os.path.normpath(os.path.join(ROOT, rel_path.lstrip("/")))
        dist_path = os.path.normpath(os.path.join(DIST_ROOT, rel_path.lstrip("/")))

        if os.path.isfile(dist_path):
            path = dist_path
        elif not path.startswith(ROOT) or not os.path.isfile(path):
            self.send_error(404)
            return
        ext = os.path.splitext(path)[1].lower()
        content_type = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
        }.get(ext, "application/octet-stream")
        with open(path, "rb") as handle:
            body = handle.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/health":
            config = _llm_config()
            self._send_json(
                {
                    "ok": True,
                    "ai": {
                        "configured": bool(config["api_key"]),
                        "model": config["model"],
                        "base_url": config["base_url"],
                    },
                }
            )
            return
        self._send_file(self.path.split("?")[0])

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in ("/api/ai/calendar-agent", "/api/ai/study-materials", "/api/ai/tutor"):
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode("utf-8"))
        except (ValueError, json.JSONDecodeError):
            self._send_json({"intent": "error", "reply": "请求格式错误"}, 400)
            return
        if self.path == "/api/ai/study-materials":
            result = _handle_materials(payload)
        elif self.path == "/api/ai/tutor":
            result = _handle_tutor(payload)
        else:
            result = _handle_agent(payload)
        self._send_json(result)

    def log_message(self, format_string: str, *args) -> None:  # noqa: A002
        return


if __name__ == "__main__":
    print(f"智能日历后端已启动：http://127.0.0.1:{PORT}")
    print("AI 模式：" + ("已配置" if os.environ.get("LLM_API_KEY") else "规则降级（未设置 LLM_API_KEY）"))
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
