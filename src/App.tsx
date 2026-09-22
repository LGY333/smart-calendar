import { useEffect, useMemo, useState } from 'react'
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
    summary?: { points: string[]; keyQuestions: string[] }
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
    { id: '1', title: '四六级单词打卡', time: '07:30 - 08:00', type: 'AI推荐', status: '待诊断' },
    { id: '2', title: '考研数学：高数极限', time: '09:00 - 10:30', type: '课程', status: 'AI规划中' },
    { id: '3', title: '期末突击：专业课复盘', time: '19:30 - 21:00', type: 'AI推荐', status: '需人工复习' },
  ],
  '2026-09-22': [
    { id: '4', title: '四六级听力精听', time: '20:00 - 21:30', type: 'AI推荐', status: 'AI规划中' },
  ],
  '2026-09-23': [
    { id: '5', title: 'Python自学：数据结构', time: '15:00 - 16:30', type: '课程', status: '待诊断' },
    { id: '6', title: '挑战杯：项目路演练习', time: '19:00 - 20:00', type: 'AI推荐', status: 'AI规划中' },
  ],
}

const THINKING_STEPS = ['正在分析考纲', '正在生成每日计划', '正在整合学习资料']

const MATERIAL_THINKING_STEPS = ['读取学情画像...', '读取RAG课件知识库...', '生成学习物料...', '更新任务日历...']

const PRESET_TEMPLATES = ['考研冲刺日历', '四六级备考日历', '期末突击复习', '编程/Python自学', '挑战杯竞赛备赛']

type KnowledgeItem = { name: string; text: string }

type StudentProfile = {
  goal: string
  weakPoints: string[]
  accuracy: number
  dailyHours: number
  memoryPreference: string
}

const STORAGE_KEYS = {
  tasks: 'ai-study-tasks',
  knowledge: 'ai-study-knowledge',
  profile: 'ai-study-profile',
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key)
    return saved ? (JSON.parse(saved) as T) : fallback
  } catch {
    return fallback
  }
}

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

function detectPlanType(goal: string): '备考' | '健身' | '旅行' | '项目' {
  if (/健身|减脂|增肌|跑步|运动|锻炼/.test(goal)) return '健身'
  if (/旅行|旅游|出差|去.+玩/.test(goal)) return '旅行'
  if (/项目|开发|上线|需求|挑战杯|创业/.test(goal)) return '项目'
  return '备考'
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function iso(date: Date, hour: number, minute: number) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:${pad(minute)}:00+08:00`
}

function ruleBasedPlan(goal: string): AgentResult {
  const today = new Date(2026, 8, 21)
  const type = detectPlanType(goal)
  const end = addDays(today, 29)

  const moduleSets: Record<string, DiagnosisModule[]> = {
    备考: [
      { name: '听力', focus: '精听错题、信号词' },
      { name: '阅读', focus: '同义替换、快速定位' },
      { name: '写作', focus: '三段式模板、高频句型' },
      { name: '翻译', focus: '中国文化表达' },
    ],
    健身: [
      { name: '有氧', focus: '燃脂与心肺' },
      { name: '力量', focus: '核心与上肢' },
      { name: '拉伸', focus: '恢复与柔韧' },
    ],
    旅行: [
      { name: '交通', focus: '出行安排' },
      { name: '景点', focus: '游览路线' },
      { name: '餐饮', focus: '当地美食' },
    ],
    项目: [
      { name: '需求', focus: '目标拆解' },
      { name: '开发', focus: '核心功能' },
      { name: '测试', focus: '验证与复盘' },
    ],
  }

  const phaseSets: Record<string, string[]> = {
    备考: ['基础知识梳理', '专项强化训练', '真题模拟练习', '错题复盘总结'],
    健身: ['有氧燃脂', '力量训练', '拉伸恢复', '饮食记录'],
    旅行: ['确认交通住宿', '游览核心景点', '品尝当地美食', '自由活动'],
    项目: ['需求拆解', '核心开发', '联调测试', '上线复盘'],
  }

  const phases = phaseSets[type] || phaseSets.备考
  const events: PlanEvent[] = []
  let cursor = 0
  while (cursor < 30 && events.length < 20) {
    const day = addDays(today, cursor)
    const phase = phases[Math.floor(cursor / 3) % phases.length]
    events.push({
      title: `${type}计划：${phase}`,
      start: iso(day, 19, 30),
      end: iso(day, 20, 30),
      description: `${phase}，按遗忘曲线间隔复习`,
    })
    cursor += 1
    if (events.length % 3 === 0) cursor += 1
  }

  return {
    intent: 'create_plan',
    reply: `已为你生成${type}计划，共 ${events.length} 个日程，从今天到 ${end.getMonth() + 1}月${end.getDate()}日。`,
    diagnosis: {
      modules: moduleSets[type] || moduleSets.备考,
      strategy: '按遗忘曲线在 1/2/4/7/15 天间隔复习',
    },
    plan: {
      title: `${goal} · ${type}计划`,
      start_date: toKey(today),
      end_date: toKey(end),
      events,
    },
  }
}

function ruleBasedMaterials(task: Task): Materials {
  if (/单词|词汇|背/.test(task.title)) {
    return {
      task_type: '背单词',
      title: '今日词汇表',
      content: {
        words: [
          { word: 'abandon', phonetic: '/əˈbændən/', meaning: '放弃；抛弃', example: 'Never abandon your dream.' },
          { word: 'acquire', phonetic: '/əˈkwaɪər/', meaning: '获得；习得', example: 'We acquire knowledge through reading.' },
          { word: 'assess', phonetic: '/əˈses/', meaning: '评估；评定', example: 'Teachers assess students\' progress.' },
          { word: 'consequence', phonetic: '/ˈkɒnsɪkwəns/', meaning: '结果；后果', example: 'Every choice has a consequence.' },
          { word: 'evaluate', phonetic: '/ɪˈvæljueɪt/', meaning: '评价；评估', example: 'We evaluate the plan carefully.' },
        ],
      },
    }
  }
  if (/真题|模考|题/.test(task.title)) {
    return {
      task_type: '做真题',
      title: '模拟题与解析',
      content: {
        questions: [
          {
            question: 'The project was completed ahead of ____.',
            options: ['schedule', 'schedules', 'scheduling', 'scheduled'],
            answer: 'A',
            analysis: 'ahead of schedule 是固定搭配，表示提前。',
          },
          {
            question: 'Which word is closest in meaning to "essential"?',
            options: ['optional', 'vital', 'minor', 'extra'],
            answer: 'B',
            analysis: 'essential 表示必要的，与 vital 同义。',
          },
          {
            question: 'She insisted on ____ by herself.',
            options: ['going', 'to go', 'go', 'gone'],
            answer: 'A',
            analysis: 'insist on 后接动名词，因此用 going。',
          },
        ],
      },
    }
  }
  if (/课件|读书|阅读|章节|教材/.test(task.title)) {
    return {
      task_type: '看课件',
      title: '核心摘要与重点问题',
      content: {
        summary: {
          points: [
            '本章核心是掌握基本概念与定义',
            '重点理解公式推导过程，而不是死记硬背',
            '结合例题掌握解题思路',
            '注意常见易错点和边界条件',
          ],
          keyQuestions: [
            '本章的核心概念是什么？用自己的话复述。',
            '公式的适用条件和推导步骤是什么？',
            '例题的解题思路能否迁移到变式题？',
            '哪些易错点需要特别标注？',
          ],
        },
      },
    }
  }
  return {
    task_type: '知识框架',
    title: '知识框架思维导图',
    content: {
      tree: {
        name: task.title,
        children: [
          { name: '核心概念', children: [{ name: '定义' }, { name: '原理' }] },
          { name: '重点难点', children: [{ name: '常见题型' }, { name: '易错点' }] },
          { name: '复习方法', children: [{ name: '记忆技巧' }, { name: '练习建议' }] },
        ],
      },
    },
  }
}

function App() {
  const today = new Date(2026, 8, 21)
  const [cursor, setCursor] = useState(new Date(2026, 8, 1))
  const [selected, setSelected] = useState(toKey(today))
  const [tasks, setTasks] = useState<Record<string, Task[]>>(() =>
    loadFromStorage(STORAGE_KEYS.tasks, SAMPLE_TASKS),
  )

  const [aiInput, setAiInput] = useState('')
  const [thinking, setThinking] = useState<string | null>(null)
  const [diagnosis, setDiagnosis] = useState<AgentResult['diagnosis'] | null>(null)
  const [draftPlan, setDraftPlan] = useState<Plan | null>(null)
  const [aiReply, setAiReply] = useState('')

  const [materialTask, setMaterialTask] = useState<Task | null>(null)
  const [materials, setMaterials] = useState<Materials | null>(null)
  const [materialLoading, setMaterialLoading] = useState(false)
  const [materialThinking, setMaterialThinking] = useState<string | null>(null)

  const [reschedule, setReschedule] = useState<string | null>(null)
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeItem[]>(() =>
    loadFromStorage(STORAGE_KEYS.knowledge, []),
  )
  const [profile, setProfile] = useState<StudentProfile>(() =>
    loadFromStorage(STORAGE_KEYS.profile, {
      goal: '一个月后通过六级',
      weakPoints: ['听力长对话', '翻译长句'],
      accuracy: 78,
      dailyHours: 2.5,
      memoryPreference: '早晨记忆型',
    }),
  )
  const [practiceOpen, setPracticeOpen] = useState(false)
  const [practiceTask, setPracticeTask] = useState<Task | null>(null)
  const [practiceAccuracy, setPracticeAccuracy] = useState(80)
  const [practiceResult, setPracticeResult] = useState<string | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [report, setReport] = useState<{ title: string; items: string[] } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'workspace' | 'calendar'>('workspace')
  const [tutorOpen, setTutorOpen] = useState(false)
  const [tutorMessages, setTutorMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([])
  const [tutorInput, setTutorInput] = useState('')
  const [tutorLoading, setTutorLoading] = useState(false)

  const grid = useMemo(
    () => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  )
  const monthLabel = `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks))
  }, [tasks])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.knowledge, JSON.stringify(knowledgeBase))
  }, [knowledgeBase])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile))
  }, [profile])

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
  const savedHours = plannedHours
  const userThinkingHours = doneCount * 1

  const moveMonth = (delta: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1))

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2200)
  }

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
      let data: AgentResult
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
        data = await res.json()
      } catch {
        data = ruleBasedPlan(goal)
      }
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
      setAiReply('生成失败，请重试')
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
    setMaterialThinking(MATERIAL_THINKING_STEPS[0])

    for (const step of MATERIAL_THINKING_STEPS) {
      setMaterialThinking(step)
      await new Promise((resolve) => setTimeout(resolve, 650))
    }

    try {
      const res = await fetch('/api/ai/study-materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_type: detectTaskType(task),
          topic: task.title,
          knowledge: knowledgeBase.map((item) => `${item.name}：${item.text}`).join('\n'),
        }),
      })
      const data = await res.json()
      setMaterials(data.materials ?? ruleBasedMaterials(task))
    } catch {
      setMaterials(ruleBasedMaterials(task))
    } finally {
      setMaterialThinking(null)
      setMaterialLoading(false)
    }
  }

  function detectTaskType(task: Task) {
    if (/单词|词汇|背/.test(task.title)) return '背单词'
    if (/真题|模考|题|复习/.test(task.title)) return '做真题'
    if (/课件|读书|阅读|章节|教材/.test(task.title)) return '看课件'
    return '知识框架'
  }

  function agentActionLabel(task: Task) {
    const type = detectTaskType(task)
    if (type === '背单词') return 'Agent执行：生成今日词表+自测'
    if (type === '做真题') return 'Agent执行：习题生成&错题诊断'
    if (type === '看课件') return 'Agent执行：生成摘要+重点问题'
    return 'Agent执行：生成知识框架'
  }

  function materialsToText(materials: Materials) {
    const lines: string[] = [materials.title, '']
    if (materials.content.words) {
      materials.content.words.forEach((word) => {
        lines.push(`${word.word} ${word.phonetic}`, `${word.meaning}`, `例句：${word.example}`, '')
      })
    }
    if (materials.content.questions) {
      materials.content.questions.forEach((question, index) => {
        lines.push(`${index + 1}. ${question.question}`)
        question.options.forEach((option, optionIndex) => {
          lines.push(`${String.fromCharCode(65 + optionIndex)}. ${option}`)
        })
        lines.push(`答案：${question.answer}　${question.analysis}`, '')
      })
    }
    if (materials.content.summary) {
      lines.push('核心摘要：')
      materials.content.summary.points.forEach((point) => lines.push(`- ${point}`))
      lines.push('', '重点问题：')
      materials.content.summary.keyQuestions.forEach((question) => lines.push(`- ${question}`))
    }
    if (materials.content.tree) {
      lines.push(materials.content.tree.name)
      materials.content.tree.children?.forEach((child) => {
        lines.push(`- ${child.name}`)
        child.children?.forEach((leaf) => lines.push(`  - ${leaf.name}`))
      })
    }
    return lines.join('\n')
  }

  function copyMaterials() {
    if (!materials) return
    navigator.clipboard.writeText(materialsToText(materials)).then(
      () => showToast('已复制到剪贴板'),
      () => showToast('复制失败'),
    )
  }

  function exportMaterials() {
    if (!materials) return
    const blob = new Blob([materialsToText(materials)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${materials.title || '学习资料'}.txt`
    link.click()
    URL.revokeObjectURL(url)
    showToast('已导出')
  }

  function exportCalendar() {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AI学习规划助手//CN']
    Object.values(tasks)
      .flat()
      .forEach((task) => {
        const time = task.time.split(' - ')
        const start = time[0] || '09:00'
        const end = time[1] || '10:00'
        const key = selected.replace(/-/g, '')
        lines.push('BEGIN:VEVENT')
        lines.push(`SUMMARY:${task.title}`)
        lines.push(`DTSTART:${key}T${start.replace(':', '')}00`)
        lines.push(`DTEND:${key}T${end.replace(':', '')}00`)
        lines.push('END:VEVENT')
      })
    lines.push('END:VCALENDAR')

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '学习日历.ics'
    link.click()
    URL.revokeObjectURL(url)
    showToast('日历已导出')
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
      let data: AgentResult
      try {
        const res = await fetch('/api/ai/calendar-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: '帮我规划学习目标：一个月后要考四级。请从今天开始按遗忘曲线安排每日任务。',
            context: { today: toKey(today), timezone: 'Asia/Shanghai', existing_events: [] },
          }),
        })
        data = await res.json()
      } catch {
        data = ruleBasedPlan('一个月后要考四级')
      }
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
        try {
          const matRes = await fetch('/api/ai/study-materials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_type: '做真题', topic: '四级' }),
          })
          const matData = await matRes.json()
          setMaterials(matData.materials ?? ruleBasedMaterials({ id: 'demo', title: '四级真题模考', time: '', type: 'AI推荐', status: 'AI规划中' }))
        } catch {
          setMaterials(ruleBasedMaterials({ id: 'demo', title: '四级真题模考', time: '', type: 'AI推荐', status: 'AI规划中' }))
        }
        setMaterialLoading(false)
        // 演示闭环：模拟用户完成一次练习，AI 更新画像
        setProfile((prev) => ({
          ...prev,
          accuracy: Math.round((prev.accuracy + 85) / 2),
        }))
        setTasks((prev) => {
          const next = { ...prev }
          Object.keys(next).forEach((key) => {
            next[key] = next[key].map((task) =>
              task.id.startsWith('demo-') && /真题|模考/.test(task.title)
                ? { ...task, status: '已掌握' as TaskStatus }
                : task,
            )
          })
          return next
        })
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
      title: `${profile.goal} · 学情复盘报告`,
      items: [
        `学习目标：${profile.goal}`,
        `薄弱知识点：${profile.weakPoints.join('、')}`,
        `历史正确率：${profile.accuracy}%`,
        `本周坚持率：${adherence}%`,
        `AI 生成题目：${aiQuestionCount} 道`,
        `AI 节省时间：${savedHours} 小时`,
        `下周建议：针对「${profile.weakPoints[0] || '薄弱点'}」增加专项训练`,
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

  function openTutor() {
    setTutorOpen(true)
    if (tutorMessages.length === 0) {
      setTutorMessages([
        { role: 'ai', text: '你好，我是你的 AI 学习导师。告诉我你的目标、进度或遇到的困难，我来帮你。' },
      ])
    }
  }

  async function sendTutorMessage() {
    const text = tutorInput.trim()
    if (!text || tutorLoading) return
    setTutorMessages((prev) => [...prev, { role: 'user', text }])
    setTutorInput('')
    setTutorLoading(true)

    try {
      const res = await fetch('/api/ai/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: {
            goal: profile.goal,
            weak_points: profile.weakPoints,
            accuracy: `${profile.accuracy}%`,
            daily_hours: `${profile.dailyHours}小时`,
          },
        }),
      })
      const data = await res.json()
      setTutorMessages((prev) => [...prev, { role: 'ai', text: data.reply || '抱歉，我暂时没理解，请换个说法。' }])
    } catch {
      setTutorMessages((prev) => [...prev, { role: 'ai', text: '建议先完成今天的核心任务，再针对薄弱知识点做错题复盘。' }])
    } finally {
      setTutorLoading(false)
    }
  }

  function openPractice(task: Task) {
    setPracticeTask(task)
    setPracticeAccuracy(80)
    setPracticeResult(null)
    setPracticeOpen(true)
  }

  async function submitPractice() {
    if (!practiceTask) return
    setPracticeResult('Agent 正在分析你的练习结果…')

    try {
      const res = await fetch('/api/ai/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `我刚完成「${practiceTask.title}」，本次正确率 ${practiceAccuracy}%。请分析错题原因，并给出下一步学习建议。`,
          context: {
            goal: profile.goal,
            weak_points: profile.weakPoints,
            accuracy: `${profile.accuracy}%`,
            daily_hours: `${profile.dailyHours}小时`,
          },
        }),
      })
      const data = await res.json()
      const reply = data.reply || '分析完成，建议继续巩固薄弱知识点。'
      setPracticeResult(reply)

      // 更新画像：正确率取平均，任务标记为已掌握
      setProfile((prev) => ({
        ...prev,
        accuracy: Math.round((prev.accuracy + practiceAccuracy) / 2),
      }))
      setTasks((prev) => {
        const next = { ...prev }
        Object.keys(next).forEach((key) => {
          next[key] = next[key].map((task) =>
            task.id === practiceTask.id ? { ...task, status: '已掌握' as TaskStatus } : task,
          )
        })
        return next
      })
    } catch {
      setPracticeResult('分析完成。建议针对错题再做 2-3 道同类练习。')
      setTasks((prev) => {
        const next = { ...prev }
        Object.keys(next).forEach((key) => {
          next[key] = next[key].map((task) =>
            task.id === practiceTask.id ? { ...task, status: '需人工复习' as TaskStatus } : task,
          )
        })
        return next
      })
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-[#1f2328]">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-bold tracking-tight">AI学习规划助手</div>
            <p className="mt-1 bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-sm font-bold text-transparent">
              一个人 + 一个AI学习Agent = 一家高效运转的“个人学习公司”
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700">
              <span className="size-2 rounded-full bg-violet-500" />
              本周已由 AI 代劳节省 {plannedHours}h
            </div>
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setActiveView('workspace')}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                  activeView === 'workspace' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                AI工作台
              </button>
              <button
                type="button"
                onClick={() => setActiveView('calendar')}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                  activeView === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                日历
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <button
              type="button"
              onClick={exportCalendar}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              导出日历文件
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex flex-col gap-5">
          {activeView === 'workspace' && (
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
                <div className="text-xs font-semibold text-slate-700">
                  学习知识库 · 专属资料引擎
                </div>
                <label className="shrink-0 cursor-pointer rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200">
                  上传课件/教材
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.json"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <span className="rounded-md bg-slate-100 px-2 py-1">上传课件/教材</span>
                <span className="text-slate-400">→</span>
                <span className="rounded-md bg-slate-100 px-2 py-1">AI 分析知识点</span>
                <span className="text-slate-400">→</span>
                <span className="rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-700">自动生成复习计划与题库</span>
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
          )}

          {activeView === 'workspace' && (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">今日 AI 推荐核心任务</h2>
              <span className="text-xs text-slate-400">待执行</span>
            </div>
            {selectedTasks.filter((task) => task.status !== '已掌握').length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">今天暂无待执行任务</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {selectedTasks
                  .filter((task) => task.status !== '已掌握')
                  .map((task) => (
                    <div
                      key={task.id}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-left transition hover:border-blue-300"
                    >
                      <span className="size-4 shrink-0 rounded-full border-2 border-blue-300" />
                      <div className="min-w-0 flex-1 basis-40">
                        <div className="truncate text-sm font-medium">{task.title}</div>
                        <div className="mt-0.5 text-xs text-slate-400">{task.time}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => generateMaterials(task)}
                        className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                      >
                        {agentActionLabel(task)}
                      </button>
                      <button
                        type="button"
                        onClick={() => openPractice(task)}
                        className="shrink-0 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-50"
                      >
                        提交练习
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
          )}

          {activeView === 'workspace' && (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">AI 已生成学习物料</h2>
              <span className="text-xs text-slate-400">预览</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => generateMaterials({ id: 'm1', title: '四六级单词打卡', time: '07:30 - 08:00', type: 'AI推荐', status: 'AI规划中' })} className="rounded-xl bg-blue-50 p-3 text-left transition hover:bg-blue-100">
                <div className="text-xs font-semibold text-blue-700">今日词汇表</div>
                <div className="mt-1 text-xs text-slate-500">10 个高频词 + 例句</div>
              </button>
              <button type="button" onClick={() => generateMaterials({ id: 'm2', title: '四六级真题模考', time: '19:30 - 21:00', type: 'AI推荐', status: 'AI规划中' })} className="rounded-xl bg-green-50 p-3 text-left transition hover:bg-green-100">
                <div className="text-xs font-semibold text-green-700">模拟题与解析</div>
                <div className="mt-1 text-xs text-slate-500">3 道真题 + 答案解析</div>
              </button>
              <button type="button" onClick={() => generateMaterials({ id: 'm3', title: '考研数学：高数复习', time: '19:00 - 20:00', type: 'AI推荐', status: '需人工复习' })} className="rounded-xl bg-orange-50 p-3 text-left transition hover:bg-orange-100">
                <div className="text-xs font-semibold text-orange-700">知识框架思维导图</div>
                <div className="mt-1 text-xs text-slate-500">高数核心知识点</div>
              </button>
              <button type="button" onClick={() => generateMaterials({ id: 'm4', title: 'Python自学：数据结构课件', time: '15:00 - 16:30', type: '课程', status: '待诊断' })} className="rounded-xl bg-violet-50 p-3 text-left transition hover:bg-violet-100">
                <div className="text-xs font-semibold text-violet-700">核心摘要与重点问题</div>
                <div className="mt-1 text-xs text-slate-500">课件知识点提炼</div>
              </button>
            </div>
          </div>
          )}

          {activeView === 'calendar' && (
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <button type="button" onClick={() => moveMonth(-1)} className="grid size-8 place-items-center rounded-full border border-slate-200">‹</button>
              <div className="text-lg font-semibold">{monthLabel}</div>
              <button type="button" onClick={() => moveMonth(1)} className="grid size-8 place-items-center rounded-full border border-slate-200">›</button>
            </div>
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
          )}
        </section>

        <aside className="flex flex-col gap-5">
          {activeView === 'workspace' && (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">AI 学习建议</h2>
              <span className="text-xs text-slate-400">基于你的学情</span>
            </div>
            <div className="flex flex-col gap-2">
              {[
                '今日听力任务建议安排在早晨，记忆效果更好。',
                '你连续 3 天完成单词打卡，可适当提高单次词汇量。',
                '高数极限章节正确率偏低，建议增加错题复盘。',
                '挑战杯路演临近，建议今晚完成一次模拟答辩。',
              ].map((advice) => (
                <div key={advice} className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <span className="mt-0.5 size-2 shrink-0 rounded-full bg-blue-500" />
                  {advice}
                </div>
              ))}
            </div>
          </section>
          )}

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
            <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <div><span className="font-medium text-blue-600">AI规划中</span>：Agent 正在读取课件、学情画像，生成个性化任务</div>
              <div><span className="font-medium text-slate-500">待诊断</span>：完成练习后 Agent 自动分析错题</div>
              <div><span className="font-medium text-amber-600">需人工复习</span>：深度理解环节，由用户主导，AI 仅辅助答疑</div>
              <div><span className="font-medium text-green-600">已掌握</span>：已通过练习验证掌握</div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">学生学习画像</h2>
              <span className="text-xs text-slate-400">Agent 动态规划依据</span>
            </div>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-400">学习目标</span>
                <span className="font-medium text-slate-700">{profile.goal}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-400">薄弱知识点</span>
                <span className="font-medium text-slate-700">{profile.weakPoints.join('、')}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-400">历史正确率</span>
                <span className="font-medium text-blue-700">{profile.accuracy}%</span>
              </div>
              <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-400">每日可用时长</span>
                <span className="font-medium text-slate-700">{profile.dailyHours} 小时</span>
              </div>
              <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-400">记忆偏好</span>
                <span className="font-medium text-slate-700">{profile.memoryPreference}</span>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">一人公司效能看板</h2>
              <span className="text-xs text-slate-400">人机分工 · 本周</span>
            </div>
            <div className="mb-3 rounded-xl bg-blue-50 p-3">
              <div className="mb-2 text-xs font-semibold text-blue-700">AI Agent 完成工作</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-blue-700">{totalTasks}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">执行任务</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-700">{aiQuestionCount}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">生成资料</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-700">{savedHours}h</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">资料/出题/排程</div>
                </div>
              </div>
            </div>
            <div className="mb-3 rounded-xl bg-green-50 p-3">
              <div className="mb-2 text-xs font-semibold text-green-700">用户本人完成工作</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-green-700">{doneCount}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">完成学习</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-green-700">{adherence}%</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">坚持率</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-green-700">{userThinkingHours}h</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">深度思考</div>
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-slate-900 px-3 py-2.5 text-center text-xs font-semibold text-white">
              单人成军：你加上 AI，就是一支完整的团队
            </div>
            <div className="mt-2 text-center text-[10px] text-slate-400">Agent 代为完成资料整理、出题、排程合计 {savedHours} 小时，用户聚焦深度思考学习 · 数据随任务实时更新</div>
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
                    <div className="mt-2 rounded-lg bg-blue-600 py-1.5 text-center text-xs font-semibold text-white">
                      {agentActionLabel(task)}
                    </div>
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
              onClick={openTutor}
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
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="size-2.5 animate-pulse rounded-full bg-blue-500" />
                  <span className="text-sm font-semibold text-slate-700">Agent 执行日志</span>
                </div>
                <div className="flex flex-col gap-2">
                  {MATERIAL_THINKING_STEPS.map((step, index) => {
                    const currentIndex = MATERIAL_THINKING_STEPS.indexOf(materialThinking || '')
                    const done = currentIndex > index
                    const active = materialThinking === step
                    return (
                      <div key={step} className="flex items-center gap-2 text-xs">
                        <span
                          className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                            done ? 'bg-green-500 text-white' : active ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-400'
                          }`}
                        >
                          {done ? '✓' : index + 1}
                        </span>
                        <span className={done ? 'text-slate-400 line-through' : active ? 'font-semibold text-blue-700' : 'text-slate-400'}>
                          {step}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!materialLoading && materials && (
              <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500">
                <span className="font-medium text-slate-600">来源：</span>
                {knowledgeBase.length > 0 ? `用户上传的《${knowledgeBase[0].name}》` : 'Demo 演示数据'}
              </div>
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

            {!materialLoading && materials?.content.summary && (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="mb-2 text-sm font-semibold">核心摘要</div>
                  <div className="flex flex-col gap-1.5">
                    {materials.content.summary.points.map((point) => (
                      <div key={point} className="text-xs text-slate-600">· {point}</div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl bg-blue-50 p-3">
                  <div className="mb-2 text-sm font-semibold text-blue-700">重点问题</div>
                  <div className="flex flex-col gap-1.5">
                    {materials.content.summary.keyQuestions.map((question) => (
                      <div key={question} className="text-xs text-slate-700">？{question}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!materialLoading && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2.5 text-xs font-medium text-green-700">
                <span className="size-2 rounded-full bg-green-500" />
                已由 AI 完成，请用户复习
              </div>
            )}

            {!materialLoading && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={copyMaterials}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium transition hover:bg-slate-50"
                >
                  复制
                </button>
                <button
                  type="button"
                  onClick={exportMaterials}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium transition hover:bg-slate-50"
                >
                  一键导出
                </button>
              </div>
            )}

            {!materialLoading && demoMode && (
              <button
                type="button"
                onClick={finishDemo}
                className="mt-3 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                完成，生成复盘报告
              </button>
            )}
          </div>
        </div>
      )}

      {tutorOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center">
          <div className="flex h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-green-500" />
                <h2 className="text-base font-semibold">AI 学习导师</h2>
              </div>
              <button
                type="button"
                onClick={() => setTutorOpen(false)}
                className="grid size-8 place-items-center rounded-full bg-slate-100"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-2.5">
                {tutorMessages.map((message, index) => (
                  <div
                    key={index}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 ${
                      message.role === 'user'
                        ? 'self-end bg-blue-600 text-white'
                        : 'self-start bg-slate-100 text-slate-700'
                    }`}
                  >
                    {message.text}
                  </div>
                ))}
                {tutorLoading && (
                  <div className="self-start rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-400">
                    AI 导师正在思考…
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
              <input
                value={tutorInput}
                onChange={(event) => setTutorInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') sendTutorMessage()
                }}
                placeholder="问导师：例如，我听力总是错很多，怎么办？"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={sendTutorMessage}
                disabled={tutorLoading}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                发送
              </button>
            </div>
          </div>
        </div>
      )}

      {practiceOpen && practiceTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">提交练习结果</h2>
              <button
                type="button"
                onClick={() => setPracticeOpen(false)}
                className="grid size-8 place-items-center rounded-full bg-slate-100"
              >
                ×
              </button>
            </div>
            <div className="mb-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
              {practiceTask.title}
            </div>
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-slate-500">本次正确率</span>
                <span className="font-semibold text-blue-600">{practiceAccuracy}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={practiceAccuracy}
                onChange={(event) => setPracticeAccuracy(Number(event.target.value))}
                className="w-full"
              />
            </div>
            {practiceResult && (
              <div className="mb-4 rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-6 text-slate-700">
                {practiceResult}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPracticeOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={submitPractice}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                提交并让 Agent 分析
              </button>
            </div>
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

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

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
