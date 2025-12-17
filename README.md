This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Environment Variables

Before running the development server, make sure to add your Google Maps API key to `.env.local`:

```
GOOGLE_MAPS_API_KEY=your_api_key_here
```

**⚠️ 請記得將你的 Google Maps API Key 貼到 `.env.local` 檔案中！**

#### Cross-device sync (帳密登入 + 去過餐廳同步)

本專案支援用「帳號 / 密碼」登入，並把使用者勾選的「去過餐廳」同步到雲端（跨裝置 / 跨瀏覽器）。

在 `.env.local`（以及 Netlify 的 Environment variables）新增：

```
# Simple login (single shared account)
APP_USERNAME=your_username
APP_PASSWORD=your_password

# Cookie signing secret (random long string)
APP_SESSION_SECRET=your_random_secret

# Supabase (DB)
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Supabase 建表 SQL 請參考 `docs/SUPABASE.md`。

### Running the Development Server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
