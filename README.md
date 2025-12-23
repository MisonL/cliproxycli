<p align="center">
  <img src="https://img.shields.io/badge/Go-1.24-00ADD8?style=flat-square&logo=go" alt="Go Version">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker" alt="Docker">
  <img src="https://img.shields.io/github/license/MisonL/cliproxycli?style=flat-square" alt="License">
</p>

<h1 align="center">🚀 CLI Proxy API</h1>

<p align="center">
  <strong>一个支持 OpenAI/Gemini/Claude 兼容 API 的智能代理服务器</strong><br>
  专为 AI 编程工具设计 · 多源聚合 · 智能路由 · 可视化管理
</p>

---

> **🔀 Fork 声明**  
> 本项目基于 [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 的 [`d1220de`](https://github.com/router-for-me/CLIProxyAPI/commit/d1220de02dd125051323716bdd2b5781cd7b0d60) 提交进行二次开发。感谢原作者的开源贡献！

---

## ✨ 核心特性

<table>
<tr>
<td width="50%">

### 🔌 多源 AI 提供商

| 提供商         | 认证方式          |
| -------------- | ----------------- |
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
</table>

---

## 🚀 快速开始

### Docker 一键部署

```bash
# 1. 克隆仓库
git clone https://github.com/MisonL/cliproxycli.git
cd cliproxycli

# 2. 复制配置
cp config.example.yaml config.yaml

# 3. 启动服务
./docker-build.sh
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

## 🤝 致谢

感谢原项目 [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 的开源贡献。

---

<p align="center">
  <strong>📄 MIT License</strong>
</p>
