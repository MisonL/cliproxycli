<h1 align="center">🚀 CLI Proxy API</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.24-00ADD8?style=flat-square&logo=go" alt="Go Version">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/Offline-100%25-green?style=flat-square&logo=offline" alt="Offline Ready">
  <img src="https://img.shields.io/github/license/MisonL/cliproxycli?style=flat-square" alt="License">
</p>

<p align="center">
  <strong>一个支持 OpenAI/Gemini/Claude 兼容 API 的智能代理服务器</strong><br>
  专为 AI 编程工具设计 · 多源聚合 · 智能路由 · 可视化管理 · 完全离线化
</p>

---

---

## ✨ 核心特性

<table>
<tr>
<td width="50%">

### 安全性说明 (Security Note)

> [!IMPORTANT] > **默认安全原则**: 如果配置文件中没有配置任何 `auth.providers` 或 `api-keys`，代理服务器将默认**拒绝所有外部 API 请求** (401 Unauthorized)。这可以防止服务在未授权情况下被公开扫描。

### 🛡️ 完全离线化 (Offline Ready)

- **零外部依赖**: 移除所有对 GitHub 等外部服务的版本检查和资源请求。
- **内嵌前端**: 管理后台资源直接编译进二进制文件，开箱即用。
- **本地环境**: 针对内网隔离环境优化，启动无超时等待。

### 🔌 多源 AI 提供商

| 提供商         | 认证方式          |
| :------------- | :---------------- |
| Gemini CLI     | OAuth             |
| AI Studio      | API Key / 多账号  |
| Antigravity    | Cloud Code OAuth  |
| Claude Code    | Anthropic OAuth   |
| OpenAI Codex   | GPT OAuth         |
| Qwen Code      | 通义千问 OAuth    |
| iFlow          | 平台集成          |
| GitHub Copilot | OAuth             |
| Kiro           | AWS CodeWhisperer |

</td>
<td width="50%">

### 🎯 智能路由引擎

- **前缀路由**: `ant:gpt-4o` → Antigravity
- **负载均衡**: 优先级 / 权重策略
- **故障转移**: 自动重试备用渠道

### 📡 API 兼容性

- OpenAI Chat Completions
- OpenAI Responses API
- Anthropic Messages API
- Google Generative AI
- 流式 & 非流式响应
- Function Calling / Tools
- 多模态（文本 + 图片）

</td>
</tr>
</table>

---

## 🆚 与上游版本对比 (Comparison with Upstream)

本项目基于原版 CLI Proxy 进行了深度重构与增强，主要差异如下：

| 特性 (Feature) | 上游原版 (Upstream) | 本增强版 (Enhanced Version)                                 |
| :------------- | :------------------ | :---------------------------------------------------------- |
| **管理界面**   | 无 / 简易           | **全功能 React 管理后台** (实时监控、配置管理、日志审计)    |
| **模型调度**   | 基础转发            | **企业级模型池** (支持负载均衡、健康检查、故障转移)         |
| **部署依赖**   | 需联网下载资源      | **完全离线化 (Offline Ready)**，前端资源内嵌二进制          |
| **认证支持**   | API Key 为主        | **统一身份认证 (Unified Auth)**，集成 OAuth/Cookie 多种方式 |
| **定时任务**   | 无                  | **内置调度器 (Scheduler)**，支持定时保活、自动刷新 Token    |
| **日志系统**   | 终端输出            | **可视化日志流**，支持多维筛选、归档与下载                  |

---

## 🖥️ Web 管理中心

<table>
<tr>
<td>📊 <strong>实时统计</strong></td>
<td>🔐 <strong>认证管理</strong></td>
<td>⏰ <strong>定时任务</strong></td>
<td>🤖 <strong>AI 助手</strong></td>
</tr>
<tr>
<td>请求量/成功率图表</td>
<td>OAuth 一键登录</td>
<td>间隔/定时/每日循环</td>
<td>可配置模型与参数</td>
</tr>
<tr>
<td colspan="4">⚡️ <strong>高性能日志</strong>: 采用虚拟列表技术，流畅渲染数万条请求记录</td>
</tr>
</table>
<br>

> **✅ 验证状态 (Verified Status)**:
>
> - **Dashboard**: 核心图表与数据流实测通过
> - **Scheduler**: 定时任务调度与鉴权回路 (Loopback Auth) 修复确认
> - **API Keys**: 密钥生命周期管理功能验证完成
> - **System**: 版本信息与环境元数据展示正常 (离线模式)

---

## 🚀 快速开始

### Docker 一键部署

```bash
# 1. 克隆仓库
git clone https://github.com/MisonL/cliproxycli.git
cd cliproxycli

# 2. 复制配置
cp config.example.yaml config.yaml

# 3. 启动服务 (自动构建并内嵌前端)
docker-compose up -d --build
```

### 访问管理界面

```
http://localhost:8317/management.html
```

---

## 📁 项目结构

```
├── cmd/                    # CLI 入口
├── internal/
│   ├── api/               # HTTP API 服务
│   ├── auth/              # OAuth 认证模块
│   ├── router/            # 智能路由引擎
│   ├── runtime/executor/  # 提供商执行器
│   ├── scheduler/         # 定时任务调度
│   └── translator/        # 协议转换器
├── management-center/     # React 管理界面
├── sdk/                   # 可复用 Go SDK
└── docker-compose.yml
```

---

## 🔧 配置示例

```yaml
listen-addr: :8317
secret-key: your-secret-key

api-keys:
  - sk-your-api-key

openai-providers:
  - name: openrouter
    base-url: https://openrouter.ai/api/v1
    api-keys:
      - key: sk-or-xxx
    models:
      - name: anthropic/claude-3.5-sonnet
        alias: claude-sonnet
```

---

## 💻 开发与贡献

欢迎提交 Pull Request 或 Issue！

- **开发指南**: 请阅读 [docs/DEV_GUIDE.md](docs/DEV_GUIDE.md) 了解环境搭建与测试流程。

---

---

<p align="center">
  <strong>📄 MIT License</strong>
</p>
