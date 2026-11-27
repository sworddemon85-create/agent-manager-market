# 智能体管家 (Agent Manager)

一个 ZCode 插件:管理你的子智能体(subagent)定义,并把大任务拆解后**并行派发**给多个智能体协作完成。

## 功能

| 组件 | 名称 | 作用 |
|---|---|---|
| 技能 | `agent-registry` | 智能体定义管家:盘点、查看、新建、修改、校验、删除智能体定义文件(用户级 `~/.zcode/agents/` 与工作区级 `<工作区>/.zcode/agents/`) |
| 技能 | `agent-team` | 多智能体调度:拆解任务 → 按 description 选人 → 同消息并行派发 → 汇总合并报告 |
| 命令 | `/agent-list` | 盘点当前可用的智能体(支持 user / workspace / all) |
| 命令 | `/agent-show` | 查看某个智能体的完整定义 |
| 命令 | `/agent-new` | 新建一个智能体定义文件 |
| 命令 | `/agent-check` | 校验所有智能体定义是否规范(只报告,不擅自修复) |
| 命令 | `/agent-team` | 把任务拆解并派发给多个子智能体,汇总结果 |
| 内置智能体 | `doc-writer` `test-runner` `issue-triage` | 装即用的三个现成智能体:文档整理、测试执行与失败分析、问题分诊排序 |
| 钩子 | SessionStart | 每次新会话自动盘点本地智能体定义,注入一份精简清单,调度时一目了然 |

## 安装

在 ZCode 中打开 **Plugin Marketplace → Add → Add Plugin Marketplace**,输入本仓库(用户名/仓库名或完整 URL)添加市场,然后在 **个人市场 → 智能体管家 (Agent Manager) → Install** 安装。

安装后**重启 ZCode**,即可在输入框看到上述命令,或在技能选择器中选择两个技能。

## 试一试

- `/agent-list` —— 列出你已有的智能体
- 「新建一个叫 doc-writer 的智能体,负责整理项目文档」—— 走 `/agent-new` 流程
- `/agent-team 审查 src 目录的代码并总结问题` —— 多智能体并行协作

> 新建的智能体一般要到下个会话才会出现在可用列表中。

## 定义格式

每个智能体是一个 Markdown 文件(YAML frontmatter + 正文提示词):

```markdown
---
name: "crawl"
description: "一句话职责,主会话据此决定派不派它"
color: yellow
injectAgentsMd: true
tools: Read, Bash
---

正文 = 该智能体的系统提示词(人设、职责、约束、输出要求)。
```

## License

[MIT](./LICENSE)

## 多智能体协作约定

`/agent-team` 会建立包含依赖、文件读写范围和验收条件的任务表，按运行时容量分批执行。同一文件只有一个写入者；公共配置由集成负责人统一处理。上游验收后才启动下游，失败时先确认旧任务停止再重试，最终报告区分已验证、未验证和阻塞事项。

例如：`/agent-team 审查插件配置与盘点脚本，分别报告问题，再根据结果补充文档`。前两项可只读并行，文档任务等待审查完成。运行时没有派发能力时，主会话明确说明并直接执行，不模拟多智能体结果。

详见 [协作技能](agent-manager/skills/agent-team/SKILL.md)。这些规则属于调度提示词，实际并发、取消和工具权限由 ZCode 运行时提供。

## 独立执行模式（0.2.0）

需要 PATH 中的 Node.js 20.3+，无 npm 依赖。此模式通过 OpenAI-compatible Chat Completions HTTP 接口启动独立模型会话，支持 1–8 并发、最多 32 项任务、依赖结果传递、失败阻塞及取消。各 worker 只有文本推理能力，没有文件读写或命令执行工具；需要实际改代码、执行测试时使用宿主原生 Agent。

配置环境变量 `AGENT_API_BASE`（包含 `/v1` 或服务商实际 API 前缀）、`AGENT_API_KEY`、`AGENT_MODEL`。密钥只从环境读取，不写进计划或仓库。远程地址要求 HTTPS，本机服务可用 loopback HTTP。调用会把计划中的 prompt、context 和上游结果发给配置的服务商，并可能产生模型费用。

在仓库根目录运行：

```sh
node agent-manager/runtime/team-cli.mjs examples/review-plan.json
node --test tests/*.test.mjs
```

CLI 输出每项状态与结果，整体不成功时退出码为 1。Ctrl+C 取消请求。单项模型请求超时 60 秒，不自动重复付费请求。运行时的 MCP 工具 `team_run` 接收相同计划对象；插件已声明 stdio 服务，命令和参数均为独立 argv。启动宿主前需设置上述环境变量。没有配置时工具返回明确错误，不回退为伪造结果。

取消后，调度器会及时把进行中及待执行的任务标记为 `cancelled`，不启动剩余任务，并忽略迟到的结果。自定义 worker 若不响应传入的 `AbortSignal`，其内部工作可能继续运行；调度器无法强制终止任意 JavaScript 工作函数。内置模型 worker 会把信号传给 HTTP 请求。

`test-runner` 在独立模式下只分析测试方案；其名称不表示执行过测试。任务完成表示模型返回了文本，不等于内容已被事实验证，主会话仍需验收。

验证范围：自动化测试可在 ZCode 外运行；模拟服务测试验证传输与调度，不证明真实模型质量或 ZCode 客户端兼容性。
