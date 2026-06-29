# Botman — Full-Stack Batcomputer AI Client (Next.js & Supabase)

Welcome to the full-stack edition of **Botman**. This application is built with **Next.js** (React) and integrates **Supabase Auth & Database** for persistent cloud storage and secure server-side Gemini API query routing.

---

## Getting Started (Prerequisites)

To run this application locally or in production, you will need to set up accounts for **Supabase** and **Google Gemini API**.

### Step 1: Database Setup in Supabase
1. Go to [Supabase](https://supabase.com) and create a free project.
2. In your Supabase Dashboard, navigate to the **SQL Editor** tab from the left sidebar.
3. Click **New Query**, open the file [supabase_schema.sql](file:///C:/Users/HI/antigravity/radiant-kepler/supabase_schema.sql), and copy-paste the entire script.
4. Click **Run** to generate the tables, Row-Level Security (RLS) policies, and user registration triggers.

### Step 2: Configure Environment Variables
1. Rename or duplicate `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Open your new `.env.local` file and fill in your keys:
   * **Supabase API Keys**: Navigate to your Supabase Dashboard -> **Project Settings** -> **API**. Copy the **Project URL** and **anon public key**.
   * **Gemini API Key**: Obtain a key for free from [Google AI Studio](https://aistudio.google.com/).

---

## Running Locally

To start the Next.js development server:

1. Open your terminal in the project directory.
2. Install npm dependencies (if not already done):
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deploying to Vercel

Since this is a standard Next.js App Router application, deploying to Vercel is fully automated:

1. Commit and push all files to your GitHub repository:
   ```bash
   git add .
   git commit -m "Migrate to full-stack Next.js and Supabase"
   git push origin main
   ```
2. Go to your [Vercel Dashboard](https://vercel.com) and import your `botman-chatbot` repository.
3. Under **Environment Variables**, add the keys defined in your `.env.local` file:
   * `NEXT_PUBLIC_SUPABASE_URL`
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   * `GEMINI_API_KEY`
4. Click **Deploy**. Vercel will build and launch your full-stack app!

<!-- trigger rebuild: 1 -->
