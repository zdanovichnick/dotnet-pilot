---
description: "View and modify DotnetPilot configuration."
argument-hint: "[key] [value] — get or set a config value"
---

# Settings

`/DotnetPilot:utility:settings` manages `.planning/config.json`.

## Usage

- **View all:** `/DotnetPilot:utility:settings` — display current config
- **Get value:** `/DotnetPilot:utility:settings dotnet.test_framework` — show specific key
- **Set value:** `/DotnetPilot:utility:settings hooks.di_check false` — disable DI advisory
- **Reset:** `/DotnetPilot:utility:settings --reset` — reset to defaults

## Common Settings

| Key | Default | Description |
|-----|---------|-------------|
| `enableProjectModel` | false | Enable `.planning/` project state (PROJECT.md, ROADMAP.md, STATE.md). Set to `true` by `/DotnetPilot:pipeline:init`. |
| `mode` | interactive | `interactive` or `auto` |
| `dotnet.test_framework` | xunit | `xunit`, `nunit`, or `mstest` |
| `dotnet.architecture_style` | clean | `clean`, `vertical-slices`, or `flat` |
| `workflow.build_after_task` | true | Run dotnet build after each task |
| `hooks.di_check` | true | Enable DI registration advisory |
