---
description: "View and modify DotnetPilot configuration."
argument-hint: "[key] [value] — get or set a config value"
---

# Settings

`/DotnetPilot:utility:settings` manages `.planning/config.json`.

## Usage

- **View all:** `/DotnetPilot:utility:settings` — display current config
- **Get value:** `/DotnetPilot:utility:settings dotnet.test_framework` — show specific key
- **Set value:** `/DotnetPilot:utility:settings workflow.research false` — disable research
- **Reset:** `/DotnetPilot:utility:settings --reset` — reset to defaults

## Common Settings

| Key | Default | Description |
|-----|---------|-------------|
| `mode` | interactive | `interactive` or `auto` |
| `dotnet.test_framework` | xunit | `xunit`, `nunit`, or `mstest` |
| `dotnet.architecture_style` | clean | `clean`, `vertical-slices`, or `flat` |
| `workflow.research` | true | Enable research phase |
| `workflow.plan_check` | true | Enable plan quality review |
| `workflow.build_after_task` | true | Run dotnet build after each task |
| `parallelization.enabled` | true | Enable parallel plan execution |
| `hooks.di_check` | true | Enable DI registration advisory |
