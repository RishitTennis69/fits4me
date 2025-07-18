-- Create user_wardrobe table for storing existing clothing items
CREATE TABLE IF NOT EXISTS public.user_wardrobe (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- shirt, pants, dress, jacket, etc.
    color TEXT,
    size TEXT,
    photo_url TEXT NOT NULL,
    ai_analysis JSONB, -- Store AI analysis results
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_wardrobe_user_id ON public.user_wardrobe(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wardrobe_category ON public.user_wardrobe(category);

-- Enable RLS (Row Level Security)
ALTER TABLE public.user_wardrobe ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own wardrobe items" ON public.user_wardrobe
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wardrobe items" ON public.user_wardrobe
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wardrobe items" ON public.user_wardrobe
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wardrobe items" ON public.user_wardrobe
    FOR DELETE USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_user_wardrobe_updated_at 
    BEFORE UPDATE ON public.user_wardrobe 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 