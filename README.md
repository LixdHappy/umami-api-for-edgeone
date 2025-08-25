# EdgeOne Pages Functions Demo

这是一个在腾讯云 EdgeOne Pages 部署的最小函数示例。

## 部署步骤
1. 把这个仓库上传到 GitHub。
2. 在 EdgeOne Pages 创建一个项目，选择导入该 GitHub 仓库。
3. 部署完成后，API 地址就是：

```
https://<你的子域名>.edgeone.run/api/send
```

## 测试
```bash
curl -X GET "https://<你的子域名>.edgeone.run/api/send"
```

返回结果：
```json
{ "message": "ok", "time": "2025-08-25T12:00:00.000Z" }
```
