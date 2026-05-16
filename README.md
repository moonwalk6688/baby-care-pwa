# 宝宝照护 PWA

面向 0-6 个月宝宝家庭的移动端优先网页 App，用于快速记录喂奶、尿布、睡眠、拍嗝/吐奶、哭闹和交接摘要。

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

## Supabase 云端同步

1. 在 Supabase 创建项目。
2. 执行 `supabase/schema.sql`。
3. 复制 `.env.example` 为 `.env.local` 并填写：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

4. 在 Supabase Authentication 里开启 Email 登录。
   - 开发阶段建议关闭 Confirm email，方便直接注册进入。
   - 上线后可以再开启邮箱确认。
5. 重启本地服务：

```bash
npm run dev
```

现在应用会进入登录页。第一个成员创建家庭空间和宝宝档案，其他成员用邀请码加入。

## Vercel 部署

1. 把代码推到 GitHub。
2. 在 Vercel 导入仓库。
3. 在 Vercel Project Settings -> Environment Variables 添加：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

4. 部署后得到 `https://xxx.vercel.app`。
5. 在 Supabase Authentication -> URL Configuration 中设置：
   - Site URL: `https://xxx.vercel.app`
   - Redirect URLs: `https://xxx.vercel.app/**`

手机用 Safari 或 Chrome 打开线上地址后，可以添加到主屏幕。

## 数据说明

- 每条照护记录写入 `events`，并把关键详情存入 `events.details`。
- 喂奶、尿布、睡眠也会同步写入对应详情表，方便后续做统计报表。
- 所有家庭数据通过 Supabase RLS 按 `family_members` 隔离。
- 删除记录使用 `deleted_at` 软删除。
