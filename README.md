# Botman — My Custom Batcomputer AI Assistant

Hey! I'm **Shriram**, and this is **Botman**, a full-stack AI chatbot I built. It features a custom dark-themed Batcave interface, persistent cloud storage sync, and secure server-side AI stream routing.

I migrated this application from a basic static HTML website into a modern **Next.js** web application powered by **Supabase** for user authentication and database management, and the **Google Gemini API** for reasoning.

---

## What I Built

*   **Secure Uplink Auth**: Created a signup/login interface allowing users to register and persist their own private chat logs.
*   **Web Audio Synth**: Instead of using heavy audio assets, I coded low-latency synthesizer swooshes and chirps programmatically using the browser's native **Web Audio API**.
*   **Text-to-Speech (TTS)**: Added a speech synthesizer button so the assistant reads responses out loud in a deep, tactical tone.
*   **Mission Log Search**: Built a real-time search filter so I can search through my past conversation logs instantly.
*   **Custom Directives**: Added settings so users can override Botman's system instructions and change his persona on the fly.
*   **Secure API Streaming**: Built a Next.js server-side endpoint to stream Gemini responses in real-time, keeping my developer API keys secure.

---

## How I Set Up the Database (Supabase)

If you are setting this up yourself, here is the SQL structure I created. Paste this query in your Supabase SQL Editor and run it:

```sql
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    username TEXT NOT NULL,
    nickname TEXT,
    system_prompt TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Mission',
    model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    thinking TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

---

## Running it Locally

To run my project locally:

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env.local` file in the root folder and add your credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   GEMINI_API_KEY=your_google_gemini_api_key
   ```
3. Boot up the local dev server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) to view the client.

---

## Deployment (Vercel)

I deployed this app on Vercel. Since it's linked directly to my GitHub repository, any updates I commit and push are automatically built and published live! 

If redeploying, remember to save the three keys (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `GEMINI_API_KEY`) under the Environment Variables section in your Vercel Project Settings.
