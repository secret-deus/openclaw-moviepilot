# 安装指南（MoviePilot MCP → OpenClaw）

本指南用于安装并启用 `openclaw-local-services-bridge` 插件，通过 MCP 代理 MoviePilot 的工具。

## 前置条件

1. OpenClaw 已安装并可运行（Gateway 进程正常启动）。
2. MoviePilot MCP 已启用并可访问，例如 `http://localhost:3001/api/v1/mcp`。
3. 如 MoviePilot 启用了鉴权，准备好 API Key。

## 安装步骤

1. 本地开发安装（link 模式）：

```bash
openclaw plugins install -l C:\Users\admin\Documents\github.com\mcp-plugin
```

2. 编辑 `~/.openclaw/openclaw.json`，加入插件配置：

```json
{
  "plugins": {
    "entries": {
      "openclaw-local-services-bridge": {
        "enabled": true,
        "config": {
          "services": {
            "moviepilot": {
              "baseUrl": "http://localhost:3001",
              "endpointPath": "/api/v1/mcp",
              "apiKey": "YOUR_API_KEY",
              "apiKeyMode": "header",
              "toolPrefix": "moviepilot",
              "optionalTools": ["subscriptions_add", "downloads_add"]
            }
          }
        }
      }
    }
  },
  "tools": {
    "allow": ["openclaw-local-services-bridge"]
  }
}
```

3. 如需写操作工具（新增订阅/下载等），在你的 agent 或全局配置中加入 `optionalAllow`。示例：

```json
{
  "tools": {
    "optionalAllow": [
      "moviepilot_subscriptions_add",
      "moviepilot_downloads_add"
    ]
  }
}
```

4. 重启 OpenClaw Gateway。

## 验证

1. 查看插件是否启用：

```bash
openclaw plugins list
```

2. 查看插件详情：

```bash
openclaw plugins info openclaw-local-services-bridge
```

3. 如启用了 `debug: true`，启动日志会打印已注册的工具数量。

## Docker 场景提示

如果 OpenClaw 运行在容器内，`baseUrl` 可能需要改为 `http://host.docker.internal:3001` 或使用 host 网络模式。
