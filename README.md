# VibePiano

轻量、低延迟且可视化的桌面钢琴原型（项目说明与快速上手）。

## 项目愿景

VibePiano 是一款极致简约、低延迟、兼具“听音识谱”能力的桌面钢琴应用。既可作为程序员的键盘解压工具，也可用于自动演奏、音频转谱与可视化练习。

## 核心模块

- 手动弹奏（键盘映射、低延迟播放、视觉反馈）
- 智能音频提取（音频 -> MIDI，AI 转谱占位）
- 自动演播（可视化演奏、同步渲染、录音导出、音色切换）

## 快速上手（本地原型）

1. 创建并激活 Python 虚拟环境

```bash
python -m venv .venv
.\.venv\Scripts\activate
```

2. 安装依赖并启动后端（Flask）

```bash
pip install -r requirements.txt
python backend/app.py
```

3. 打开前端原型：在浏览器中打开 `frontend/index.html`（直接用浏览器打开即可）。

## 本仓库结构（示例）

- `backend/` — 后端占位服务（Flask）
- `frontend/` — 前端原型（HTML + JS 键盘映射）
- `src/` — 将来放核心库与共享代码
- `docs/` — 架构与设计说明

## 开发建议与下一步

- 集成真正的音色采样以降低感知延迟（预加载样本）。
- 后端可以用 Python 集成 Magenta / Basic-Pitch 实现转谱。
- 增加 WebSocket 或 WebAudio Worklet 优化低延迟播放与多通道同步。

---

详见 `docs/architecture.md` 获取架构说明。
