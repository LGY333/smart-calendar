import { useMemo, useState } from 'react'
import './App.css'

type TaskStatus = '待诊断' | 'AI规划中' | '需人工复习' | '已掌握'

type Task = {
  id: string
  title: string
  time: string
  type: '课程' | '运动' | 'AI推荐'
  status: TaskStatus
}

type DiagnosisModule = { name: string; focus: string }

type PlanEvent = { title: string; start: string; end: string; description?: string }

type Plan = {
  title: string
  start_date: string
  end_date: string
  events: PlanEvent[]
}

type AgentResult = {
  intent: string
  reply?: string
  diagnosis?: { modules: DiagnosisModule[]; strategy: string }
  plan?: Plan
}

type Word = { word: string; phonetic: string; meaning: string; example: string }
type Question = { question: string; options: string[]; answer: string; analysis: string }
type TreeNode = { name: string; children?: TreeNode[] }

type Materials = {
  task_type: string
  title: string
  content: {
    words?: Word[]
    questions?: Question[]
    tree?: TreeNode
  }
}

const WEEK_HEADER = ['一', '二', '三', '四', '五', '六', '日']

const TASK_COLORS: Record<Task['type'], string> = {
  课程: 'bg-blue-500',
  运动: 'bg-green-500',
  AI推荐: 'bg-orange-400',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  待诊断: 'bg-slate-400',
  AI规划中: 'bg-blue-500',
  需人工复习: 'bg-amber-500',
  已掌握: 'bg-green-500',
}

const SAMPLE_TASKS: Record<string, Task[]> = {
  '2026-09-21': [
    { id: '1', title: '六级单词打卡', time: '07:30 - 08:00', type: 'AI推荐', status: '待诊断' },
    { id: '2', title: '高等数学', time: '09:00 - 10:30', type: '课程', status: 'AI规划中' },
    { id: '3', title: '运动放松', time: '17:30 - 18:30', type: '运动', status: '已掌握' },
  ],
  '2026-09-22': [
    { id: '4', title: '英语听力精听', time: '20:00 - 21:30', type: 'AI推荐', status: 'AI规划中' },
  ],
  '2026-09-23': [
    { id: '5', title: '线性代数', time: '10:00 - 11:30', type: '课程', status: '需人工复习' },
  ],
}

const THINKING_STEPS = ['正在分析考纲', '正在生成每日计划', '正在整合学习资料']

const PRESET_TEMPLATES = ['考研冲刺', '四六级备考', '期末突击', 'Python自学', '挑战杯项目推进']

type KnowledgeItem = { name: string; text: string }

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function toKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const startDay = (first.getDay() + 6) % 7
  const cells: (Date | null)[] = []
  for (let i = 0; i < startDay; i += 1) cells.push(null)
  const days = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= days; d += 1) cells.push(new Date(year, month, d))
  return cells
}

function shortDate(value: string) {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return value
  return `${Number(m[2])}月${Number(m[3])}日`
}

function App() {
  const today = new Date(2026, 8, 21)
  const [cursor, setCursor] = useState(new Date(2026, 8, 1))
  const [selected, setSelected] = useState(toKey(today))
  const [tasks, setTasks] = useState<Record<string, Task[]>>(SAMPLE_TASKS)

  const [aiInput, setAiInput] = useState('')
  const [thinking, setThinking] = useState<string | null>(null)
  const [diagnosis, setDiagnosis] = useState<AgentResult['diagnosis'] | null>(null)
  const [draftPlan, setDraftPlan] = useState<Plan | null>(null)
  const [aiReply, setAiReply] = useState('')

  const [materialTask, setMaterialTask] = useState<Task | null>(null)
  const [materials, setMaterials] = useState<Materials | null>(null)
  const [materialLoading, setMaterialLoading] = useState(false)

  const [reschedule, setReschedule] = useState<string | null>(null)
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeItem[]>([])
  const [demoMode, setDemoMode] = useState(false)
  const [report, setReport] = useState<{ title: string; items: string[] } | null>(null)

  const grid = useMemo(
    () => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  )
  const monthLabel = `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`
  const selectedTasks = tasks[selected] ?? []
  const doneCount = Object.values(tasks)
    .flat()
    .filter((task) => task.status === '已掌握').length
  const todoCount = Object.values(tasks).flat().length - doneCount
  const totalTasks = Object.values(tasks).flat().length
  const aiQuestionCount =
    Object.values(tasks)
      .flat()
      .filter((task) => task.type === 'AI推荐' && /题|真题|模考/.test(task.title)).length * 5
  const plannedHours = Object.values(tasks)
    .flat()
    .filter((task) => task.type === 'AI推荐').length * 1.5
  const adherence = totalTasks ? Math.round((doneCount / totalTasks) * 100) : 0

  const moveMonth = (delta: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1))

  async function runAiSchedule() {
    const goal = aiInput.trim()
    if (!goal) return
    setThinking(THINKING_STEPS[0])
    setDiagnosis(null)
    setDraftPlan(null)
    setAiReply('')

    const steps = THINKING_STEPS
    for (let i = 0; i < steps.length; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 650))
      setThinking(steps[i])
    }

    try {
      const res = await fetch('/api/ai/calendar-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `帮我规划学习目标：${goal}。请从今天开始，按遗忘曲线安排每日任务。`,
          context: {
            today: toKey(today),
            timezone: 'Asia/Shanghai',
            existing_events: [],
            knowledge: knowledgeBase.map((item) => `${item.name}：${item.text}`).join('\n'),
          },
        }),
      })
      const data: AgentResult = await res.json()
      setThinking(null)
      if (data.intent === 'create_plan' && data.plan) {
        setDiagnosis(data.diagnosis ?? null)
        setDraftPlan(data.plan)
        setAiReply(data.reply ?? '')
      } else {
        setAiReply(data.reply ?? '生成失败，请重试')
      }
    } catch {
      setThinking(null)
      setAiReply('AI 服务暂时不可用，请确认后端已启动')
    }
  }

  function acceptPlan() {
    if (!draftPlan) return
    const next = { ...tasks }
    draftPlan.events.forEach((event, index) => {
      const key = event.start.slice(0, 10)
      const task: Task = {
        id: `ai-${Date.now()}-${index}`,
        title: event.title,
        time: `${event.start.slice(11, 16)} - ${event.end.slice(11, 16)}`,
        type: 'AI推荐',
        status: 'AI规划中',
      }
      next[key] = [...(next[key] ?? []), task]
    })
    setTasks(next)
    setDraftPlan(null)
    setDiagnosis(null)
    setAiInput('')
    setAiReply(`已加入 ${draftPlan.events.length} 个日程`)
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      setKnowledgeBase((prev) => [
        ...prev,
        { name: file.name, text: text.slice(0, 3000) },
      ])
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  async function generateMaterials(task: Task) {
    setMaterialTask(task)
    setMaterials(null)
    setMaterialLoading(true)
    let type = '背单词'
    if (/真题|模考|题/.test(task.title)) type = '做真题'
    if (/复习|框架|考研|数学/.test(task.title)) type = '知识框架'

    try {
      const res = await fetch('/api/ai/study-materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_type: type, topic: task.title }),
      })
      const data = await res.json()
      setMaterials(data.materials ?? null)
    } catch {
      setMaterials(null)
    } finally {
      setMaterialLoading(false)
    }
  }

  function acceptReschedule() {
    if (!reschedule) return
    setReschedule(null)
    setTasks((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((key) => {
        next[key] = next[key].map((task) =>
          task.status === '待诊断' ? { ...task, status: 'AI规划中' as TaskStatus } : task,
        )
      })
      return next
    })
  }

  async function runDemo() {
    setDemoMode(true)
    setReport(null)
    setMaterials(null)
    setMaterialTask(null)
    setDiagnosis(null)
    setDraftPlan(null)
    setAiReply('')

    const text = '一个月后要考四级'
    setAiInput('')
    for (let i = 0; i <= text.length; i += 1) {
      setAiInput(text.slice(0, i))
      await new Promise((resolve) => setTimeout(resolve, 55))
    }
    await new Promise((resolve) => setTimeout(resolve, 320))

    for (const step of THINKING_STEPS) {
      setThinking(step)
      await new Promise((resolve) => setTimeout(resolve, 620))
    }

    try {
      const res = await fetch('/api/ai/calendar-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '帮我规划学习目标：一个月后要考四级。请从今天开始按遗忘曲线安排每日任务。',
          context: { today: toKey(today), timezone: 'Asia/Shanghai', existing_events: [] },
        }),
      })
      const data: AgentResult = await res.json()
      setThinking(null)

      if (data.intent === 'create_plan' && data.plan) {
        setDiagnosis(data.diagnosis ?? null)
        setDraftPlan(data.plan)
        setAiReply(data.reply ?? '')
        await new Promise((resolve) => setTimeout(resolve, 1000))

        setTasks((prev) => {
          const next = { ...prev }
          data.plan!.events.forEach((event, index) => {
            const key = event.start.slice(0, 10)
            const task: Task = {
              id: `demo-${index}`,
              title: event.title,
              time: `${event.start.slice(11, 16)} - ${event.end.slice(11, 16)}`,
              type: 'AI推荐',
              status: 'AI规划中',
            }
            next[key] = [...(next[key] ?? []), task]
          })
          return next
        })
        setDraftPlan(null)
        setDiagnosis(null)

        setMaterialTask({ id: 'demo-material', title: '四级真题模考', time: '19:30 - 21:00', type: 'AI推荐', status: 'AI规划中' })
        setMaterialLoading(true)
        const matRes = await fetch('/api/ai/study-materials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_type: '做真题', topic: '四级' }),
        })
        const matData = await matRes.json()
        setMaterials(matData.materials ?? null)
        setMaterialLoading(false)
      }
    } catch {
      setThinking(null)
    } finally {
      setDemoMode(false)
    }
  }

  function finishDemo() {
    setMaterialTask(null)
    setMaterials(null)
    setReport({
      title: '四级备考 · 学情复盘报告',
      items: [
        '目标：一个月后通过英语四级',
        '知识模块：听力、阅读、写作、翻译',
        '本周完成率：86%',
        'AI 生成题目：24 道',
        '薄弱项：听力长对话',
        '下周建议：增加精听训练，减少基础词汇复习',
      ],
    })
  }

  function exportReport() {
    setReport({
      title: 'AI学习规划助手 · 学习报告',
      items: [
        `学习目标：${aiInput || '一个月后通过四级'}`,
        `日程总数：${Object.values(tasks).flat().length} 个`,
        `本周坚持率：${adherence}%`,
        `AI 生成题目：${aiQuestionCount} 道`,
        `规划学习时长：${plannedHours} 小时`,
        `知识库：${knowledgeBase.length ? knowledgeBase.map((k) => k.name).join('、') : '未上传'}`,
      ],
    })
    setTimeout(() => window.print(), 300)
  }

  function negotiateConflict() {
    setReschedule(
      '检测到时间冲突，我已帮您将原定 15:00 的健身顺延至明晚，并为您今晚预留了复习时间，是否接受？',
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] pb-16 text-[#1f2328] lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-bold tracking-tight">AI学习规划助手</div>
            <p className="mt-1 text-xs text-slate-500">
              让AI做你的私人教务长，一个人，一个Agent，跑通你的学习闭环
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full border border-slate-200 text-lg transition hover:bg-slate-100"
              onClick={() => moveMonth(-1)}
            >
              ‹
            </button>
            <div className="min-w-32 text-center text-xl font-semibold">{monthLabel}</div>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full border border-slate-200 text-lg transition hover:bg-slate-100"
              onClick={() => moveMonth(1)}
            >
              ›
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runDemo}
              disabled={demoMode}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
            >
              {demoMode ? '演示中…' : '一键演示模式'}
            </button>
            <button
              type="button"
              onClick={exportReport}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              导出学习报告
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex flex-col gap-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex gap-2">
              <input
                value={aiInput}
                onChange={(event) => setAiInput(event.target.value)}
                placeholder="例如：我要在两周内通过六级"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') runAiSchedule()
                }}
              />
              <button
                type="button"
                onClick={runAiSchedule}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                disabled={!!thinking}
              >
                AI排程
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {PRESET_TEMPLATES.map((template) => (
                <button
                  key={template}
                  type="button"
                  onClick={() => setAiInput(template)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition hover:border-blue-400 hover:text-blue-600"
                >
                  {template}
                </button>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-dashed border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  学习知识库：上传课件、教材、错题本，AI 将基于它们生成复习重点
                </div>
                <label className="shrink-0 cursor-pointer rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200">
                  上传文件
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.json"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
              {knowledgeBase.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {knowledgeBase.map((item, index) => (
                    <span
                      key={`${item.name}-${index}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700"
                    >
                      {item.name}
                      <button
                        type="button"
                        onClick={() =>
                          setKnowledgeBase((prev) => prev.filter((_, i) => i !== index))
                        }
                        className="text-blue-400 hover:text-blue-600"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {thinking && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm text-blue-700">
                <span className="size-3 animate-pulse rounded-full bg-blue-500" />
                {thinking}…
              </div>
            )}

            {diagnosis && draftPlan && (
              <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                <div className="mb-3 text-sm font-semibold">AI 诊断与拆解</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {diagnosis.modules.map((module) => (
                    <div key={module.name} className="rounded-xl bg-white p-3">
                      <div className="text-sm font-semibold">{module.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{module.focus}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  策略：{diagnosis.strategy || '按遗忘曲线间隔复习'}
                </div>
                <div className="mt-3 text-sm text-slate-600">
                  {aiReply || `已生成 ${draftPlan.events.length} 个日程，从 ${shortDate(draftPlan.start_date)} 到 ${shortDate(draftPlan.end_date)}。`}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={acceptPlan}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    加入日历
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftPlan(null)
                      setDiagnosis(null)
                    }}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm transition hover:bg-slate-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {!diagnosis && aiReply && !thinking && (
              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">{aiReply}</div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-slate-500">
              {WEEK_HEADER.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {grid.map((date, index) => {
                if (!date) return <div key={`empty-${index}`} />
                const key = toKey(date)
                const dayTasks = tasks[key] ?? []
                const isToday = key === toKey(today)
                const isSelected = key === selected
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(key)}
                    className={`min-h-24 rounded-2xl border p-2 text-left transition hover:border-slate-300 ${
                      isSelected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-100'
                    }`}
                  >
                    <span
                      className={`grid size-7 place-items-center rounded-full text-sm ${
                        isToday ? 'bg-blue-600 font-semibold text-white' : ''
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    <span className="mt-1.5 flex flex-col gap-1">
                      {dayTasks.slice(0, 3).map((task) => (
                        <span
                          key={task.id}
                          className={`truncate rounded-md px-1.5 py-0.5 text-[11px] text-white ${TASK_COLORS[task.type]}`}
                        >
                          {task.title}
                        </span>
                      ))}
                      {dayTasks.length > 3 && (
                        <span className="pl-1 text-[11px] text-slate-400">+{dayTasks.length - 3}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">AI学情驾驶舱</h2>
              <span className="text-xs text-slate-400">学习闭环概览</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-400">已完成</div>
                <div className="mt-1 text-lg font-semibold">{doneCount} 个</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-400">未完成</div>
                <div className="mt-1 text-lg font-semibold">{todoCount} 个</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(['待诊断', 'AI规划中', '需人工复习', '已掌握'] as TaskStatus[]).map((status) => (
                <span
                  key={status}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px]"
                >
                  <span className={`size-2 rounded-full ${STATUS_COLORS[status]}`} />
                  {status}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">OPC学业审计</h2>
              <span className="text-xs text-slate-400">一人公司 · 本周</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-blue-50 p-3">
                <div className="text-xl font-bold text-blue-700">{aiQuestionCount}</div>
                <div className="mt-1 text-xs text-slate-500">AI生成题目</div>
              </div>
              <div className="rounded-xl bg-green-50 p-3">
                <div className="text-xl font-bold text-green-700">{plannedHours}h</div>
                <div className="mt-1 text-xs text-slate-500">规划小时</div>
              </div>
              <div className="rounded-xl bg-orange-50 p-3">
                <div className="text-xl font-bold text-orange-600">{adherence}%</div>
                <div className="mt-1 text-xs text-slate-500">本周坚持率</div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">当日任务</h2>
              <span className="text-xs text-slate-400">{selectedTasks.length} 个任务</span>
            </div>
            {selectedTasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">这一天还没有日程</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {selectedTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => generateMaterials(task)}
                    className="rounded-xl border border-slate-100 px-3 py-2.5 text-left transition hover:border-slate-300"
                  >
                    <div className="flex items-center gap-3">
                      <span className="size-4 shrink-0 rounded-full border-2 border-slate-300" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{task.title}</div>
                        <div className="mt-0.5 text-xs text-slate-400">{task.time}</div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-white ${STATUS_COLORS[task.status]}`}
                      >
                        {task.status}
                      </span>
                    </div>
                    <div className="mt-2 text-right text-xs font-medium text-blue-600">让AI帮我做</div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold">AI导师</h2>
              <span className="text-xs text-slate-400">随时解答与规划</span>
            </div>
            <p className="mb-3 text-sm leading-6 text-slate-500">
              学习有卡点？告诉导师你的目标、进度和困难，AI 帮你诊断并生成下一步计划。
            </p>
            <button
              type="button"
              onClick={negotiateConflict}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              开始对话
            </button>
          </section>
        </aside>
      </main>

      {materialTask && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/35 p-3 sm:items-center">
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {materials?.title || materialTask.title}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setMaterialTask(null)
                  setMaterials(null)
                }}
                className="grid size-8 place-items-center rounded-full bg-slate-100"
              >
                ×
              </button>
            </div>

            {materialLoading && (
              <p className="py-8 text-center text-sm text-slate-400">AI 正在生成学习物料…</p>
            )}

            {!materialLoading && materials?.content.words && (
              <div className="flex flex-col gap-2">
                {materials.content.words.map((word) => (
                  <div key={word.word} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-bold">{word.word}</span>
                      <span className="text-xs text-slate-400">{word.phonetic}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">{word.meaning}</div>
                    <div className="mt-1 text-xs italic text-slate-400">{word.example}</div>
                  </div>
                ))}
              </div>
            )}

            {!materialLoading && materials?.content.questions && (
              <div className="flex flex-col gap-3">
                {materials.content.questions.map((question, index) => (
                  <div key={index} className="rounded-xl bg-slate-50 p-3">
                    <div className="text-sm font-medium">
                      {index + 1}. {question.question}
                    </div>
                    <div className="mt-2 grid gap-1">
                      {question.options.map((option, optionIndex) => (
                        <div key={option} className="text-xs text-slate-600">
                          {String.fromCharCode(65 + optionIndex)}. {option}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 rounded-lg bg-green-50 px-2 py-1.5 text-xs text-green-700">
                      答案：{question.answer}　{question.analysis}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!materialLoading && materials?.content.tree && (
              <MindMap node={materials.content.tree} />
            )}

            {!materialLoading && (
              <button
                type="button"
                onClick={finishDemo}
                className="mt-4 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                完成，生成复盘报告
              </button>
            )}
          </div>
        </div>
      )}

      {reschedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-2 flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-blue-500" />
              <h2 className="text-base font-semibold">AI 学业协商</h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">{reschedule}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={acceptReschedule}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white"
              >
                接受
              </button>
              <button
                type="button"
                onClick={() => setReschedule(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="report-sheet w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
            <div className="mb-4 border-b border-slate-100 pb-3">
              <div className="text-lg font-bold">{report.title}</div>
              <div className="mt-1 text-xs text-slate-400">生成于 2026-09-21 · AI学习规划助手</div>
            </div>
            <div className="flex flex-col gap-2">
              {report.items.map((item) => (
                <div
                  key={item}
                  className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700"
                >
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white"
              >
                打印 / 保存 PDF
              </button>
              <button
                type="button"
                onClick={() => setReport(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-slate-200 bg-white/90 px-2 py-2 backdrop-blur lg:hidden">
        {['月', '日', '任务', 'AI', '我的'].map((item, index) => (
          <button
            key={item}
            type="button"
            className={`flex-1 rounded-lg py-1.5 text-sm ${index === 0 ? 'font-semibold text-blue-600' : 'text-slate-500'}`}
          >
            {item}
          </button>
        ))}
      </nav>
    </div>
  )
}

function MindMap({ node }: { node: TreeNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="text-center text-sm font-bold text-blue-700">{node.name}</div>
      <div className="mt-3 grid gap-2">
        {node.children?.map((child) => (
          <div key={child.name} className="rounded-lg bg-white p-3">
            <div className="text-sm font-semibold">{child.name}</div>
            {child.children && child.children.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {child.children.map((leaf) => (
                  <span
                    key={leaf.name}
                    className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700"
                  >
                    {leaf.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
