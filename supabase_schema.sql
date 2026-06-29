-- ==========================================
-- BOTMAN — SUPABASE DATABASE SCHEMA SCRIPT
-- Copy-paste this script into the Supabase SQL Editor to set up your tables and policies.
-- ==========================================

-- Enable Row Level Security (RLS) policies on tables

-- 1. PROFILES TABLE (Associated with Supabase Auth Users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    username TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. CHATS TABLE (Conversation logs index)
CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Mission',
    model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- 3. MESSAGES TABLE (Individual message bubbles)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    thinking TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;


-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Ensures users can only access their own private data
-- ==========================================

-- Profiles policies
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

-- Chats policies
CREATE POLICY "Users can create their own chats" 
ON public.chats FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own chats" 
ON public.chats FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own chats" 
ON public.chats FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chats" 
ON public.chats FOR DELETE 
USING (auth.uid() = user_id);

-- Messages policies
CREATE POLICY "Users can insert messages to their own chats" 
ON public.messages FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.chats 
        WHERE public.chats.id = messages.chat_id 
        AND public.chats.user_id = auth.uid()
    )
);

CREATE POLICY "Users can view messages in their own chats" 
ON public.messages FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.chats 
        WHERE public.chats.id = messages.chat_id 
        AND public.chats.user_id = auth.uid()
    )
);


-- ==========================================
-- AUTHENTICATION TRIGGERS
-- Automatically create profile row when user signs up
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to auth.users insertions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
