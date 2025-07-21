-- Create fit_analyses table for storing user fit analysis results
CREATE TABLE IF NOT EXISTS public.fit_analyses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    clothing_name TEXT,
    clothing_url TEXT,
    preferred_size TEXT,
    fit_score INTEGER,
    recommendation TEXT,
    overlay_image TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.fit_analyses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own fit analyses" ON public.fit_analyses
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fit analyses" ON public.fit_analyses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fit analyses" ON public.fit_analyses
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own fit analyses" ON public.fit_analyses
    FOR DELETE USING (auth.uid() = user_id); 