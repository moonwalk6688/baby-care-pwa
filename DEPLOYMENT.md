# Supabase 和 Vercel 操作清单

## 1. 创建 Supabase 项目

在 Supabase 新建项目后，进入 SQL Editor，完整执行：

```text
supabase/schema.sql
```

执行成功后确认这些表存在：

- users
- families
- family_members
- babies
- events
- feeding_details
- diaper_details
- sleep_details
- notes

## 2. 配置本地环境变量

复制 `.env.example` 为 `.env.local`：

```bash
NEXT_PUBLIC_SUPABASE_URL=你的 Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 anon public key
```

重启：

```bash
npm run dev
```

## 3. 试用账号流程

1. 第一个人注册。
2. 创建家庭空间和宝宝档案。
3. 进入「家庭」页复制邀请码。
4. 第二个人注册后选择「输入邀请码」加入。
5. 两台手机分别新增记录，刷新后应能互相看到。

## 4. 部署到 Vercel

1. 代码推到 GitHub。
2. Vercel 导入仓库。
3. 添加相同的环境变量：
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
4. 部署。
5. 回到 Supabase Authentication -> URL Configuration：
   - Site URL 设置为 Vercel 域名
   - Redirect URLs 添加 `https://你的域名/**`

## 5. 上线前建议

- 开启 Supabase 邮箱确认。
- 用两个真实手机账号测试邀请码。
- 用 iPhone Safari 和安卓 Chrome 分别添加到主屏幕。
- 确认公司电脑关机后，Vercel 线上地址仍可访问。
