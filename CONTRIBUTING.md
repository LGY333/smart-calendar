# 共同开发指南

## 1. 准备代码仓库

当前项目是纯静态网页，没有构建步骤，协作者只需要浏览器和文本编辑器即可。

先安装 Git，然后在项目目录初始化并提交：

```powershell
cd C:\Users\17174\Documents\Codex\2026-09-14\new-chat\outputs\smart-calendar
git init
git add .
git commit -m "初始化智能日历"
```

再创建一个远程仓库，例如 GitHub、Gitee 或 GitLab，然后推送：

```powershell
git remote add origin <你的仓库地址>
git branch -M main
git push -u origin main
```

## 2. 分工建议

| 模块 | 主要文件 |
|---|---|
| 日历视图与拖拽 | `index.html`、`styles.css`、`main.js` |
| AI 解析与语音 | `main.js` 中的 AI、语音相关函数 |
| 目标与自动排程 | `main.js` 中的 goal、schedule 相关函数 |
| 数据持久化与导入导出 | `main.js` 中的 storage、JSON/ICS 相关函数 |
| PWA 与通知 | `manifest.json`、`sw.js`、通知相关函数 |

建议每个人只改自己负责的模块，避免同时修改同一个文件。

## 3. 日常协作流程

1. 在仓库里用 Issue 记录要做的功能或问题。
2. 每个人从 `main` 拉取最新代码。
3. 创建自己的功能分支：

```powershell
git checkout -b feature/voice-assistant
```

4. 完成修改后提交并推送：

```powershell
git add .
git commit -m "增加语音助理"
git push -u origin feature/voice-assistant
```

5. 在 GitHub/Gitee 上创建 Pull Request。
6. 至少一个人审查代码，确认没有冲突后再合并到 `main`。

## 4. 本地运行

项目是静态网页，可以直接打开 `index.html`；如果需要通知、PWA 和麦克风权限，建议启动本地服务器：

```powershell
python -m http.server 8000
```

访问 `http://localhost:8000/index.html`。

## 5. 合并冲突处理

如果多人同时改了 `main.js`，合并时可能冲突。建议：

- 先把函数按模块拆成独立文件。
- 或使用 GitHub 的在线冲突解决工具。
- 每次提交前先 `git pull origin main`。

## 6. 部署预览

推荐使用 GitHub Pages、Vercel 或 Netlify 部署静态网站。每次 Pull Request 可以自动生成预览链接，便于验收。
