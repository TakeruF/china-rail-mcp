# 自托管 China Rail MCP

**简体中文** | [English](SELF_HOSTING.en.md)

本指南介绍三种可重复部署方式：

1. 本地 stdio：供同一台电脑上的 MCP 客户端使用；
2. Docker stdio：在固定的 Node.js 20 容器中运行；
3. 私有 Vercel 部署：供必须使用公网 HTTPS MCP 地址的客户端连接。

服务器不需要 12306 账号、用户 Cookie、验证码、短信或支付信息。

## 前置条件

- Git
- Node.js 20 或更高版本
- npm 10 或更高版本
- 查询实时铁路数据时，需要能通过 HTTPS 访问 `12306.cn`

Docker 为可选项。仓库中的 CI 配置覆盖 Windows、macOS 和 Linux；实时 12306 测试
需要手动执行，因为它依赖不断变化的外部服务。

## 方式一：本地 stdio

```sh
git clone https://github.com/TakeruF/china-rail-mcp.git
cd china-rail-mcp
npm ci
npm run verify
```

`npm run verify` 会检查运行环境、源代码、类型、基于固定样本数据的测试、构建、格式、
生产依赖安全审计，并执行一次真实的 JSON-RPC stdio 初始化。它不会访问 12306。

如需检查当前实时公共接口，请单独执行：

```sh
npm run test:integration
```

启动服务器：

```sh
npm start
```

`npm start` 会安静地等待客户端通过标准输入/输出发送 JSON-RPC 消息，这属于正常
行为。请在 MCP 客户端配置中使用仓库的绝对路径：

```json
{
  "mcpServers": {
    "china-rail": {
      "command": "node",
      "args": ["/你的绝对路径/china-rail-mcp/dist/index.js"]
    }
  }
}
```

本地 stdio 模式不需要 `.env` 文件。

## 方式二：Docker stdio

构建使用 Node.js 20 的镜像：

```sh
docker build -t china-rail-mcp:local .
```

将容器配置为 MCP stdio 命令：

```json
{
  "mcpServers": {
    "china-rail": {
      "command": "docker",
      "args": ["run", "--interactive", "--rm", "china-rail-mcp:local"]
    }
  }
}
```

容器需要访问外部 HTTPS，但不需要挂载凭据或可写数据卷。

## 方式三：私有 Vercel 部署

仓库已包含 `vercel.json`，以及 HTTP MCP 和 OAuth 端点所需的 catch-all API 入口。
每位部署者必须生成自己的唯一密钥。不要使用示例值，也不要把密钥写入 issue、提交、
命令记录或截图。

1. 在本地生成强随机密钥：

   ```sh
   npm run generate:secret
   ```

2. 将克隆后的仓库导入自己的 Vercel 项目。
3. 在 Vercel 项目设置中，把 `MCP_HTTP_BEARER_TOKEN` 添加到 Production 环境。
4. 部署当前提交。
5. 将主机名替换为实际部署地址，运行冒烟测试：

   ```sh
   npm run smoke:http -- https://YOUR_HOST/api
   ```

   该测试不会发送部署密钥，会检查：

   ```text
   https://YOUR_HOST/api/health
   https://YOUR_HOST/.well-known/oauth-authorization-server/api
   https://YOUR_HOST/api/oauth-protected-resource
   https://YOUR_HOST/api/mcp
   ```

   前三个端点应返回 `200`。未认证访问 `/api/mcp` 应返回 `401`，并带有
   `WWW-Authenticate` 发现信息。

6. 在 ChatGPT 开发者模式中，将 `https://YOUR_HOST/api/mcp` 添加为 MCP 服务器
   URL。在 OAuth 页面输入保存在 Vercel 项目中的 `MCP_HTTP_BEARER_TOKEN`。

生成的访问令牌和刷新令牌均已签名且自包含，个人部署不需要数据库。轮换
`MCP_HTTP_BEARER_TOKEN` 会使该部署之前签发的客户端凭据、授权码、访问令牌和
刷新令牌全部失效。

## 故障排查

- `npm start` 没有输出：这是 stdio 服务器等待客户端输入的正常状态。
- `npm run doctor` 报版本错误：安装 Node.js 20 或更高版本，并重新执行
  `npm ci`。
- `npm run verify` 成功但实时查询失败：运行 `npm run test:integration`，区分
  本地构建问题与 12306 当前网络或接口状态。
- HTTP MCP 返回 `503`：部署环境中没有设置 `MCP_HTTP_BEARER_TOKEN`。
- HTTP MCP 返回 `401`：服务已运行，但当前请求尚未完成认证；请完成 OAuth 连接或
  使用正确的 Bearer Token。

## 可重复性边界

锁文件和测试可以重复验证构建及协议行为。实时时刻表、票价和余票不是确定性产物：
它们取决于未公开的 12306 公共接口、当前售票窗口、网络连通性和上游限流。实时集成
测试只能证明某个时间点的行为，不能保证未来可用性，也不能代表获准运营面向公众的
共享服务。

这套配置面向个人、低频、只读使用，不会添加多用户认证、集中式日志、批量采集、
后台轮询、购票或支付自动化。
