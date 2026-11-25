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
