使用已安装的 `alskai-notebank` Skill 作为唯一的意图路由和执行说明来源。Agent 是操作界面，CLI 负责确定性的配置解析、归档、去重和结构化结果。

Arguments:

```text
$ARGUMENTS
```

把 `$ARGUMENTS` 视为用户原始请求，按 Skill 入口选择当前任务所需的单一参考文件并完整执行。不要在斜杠命令中复制另一套工作流，也不要加载与当前意图无关的加工说明。
