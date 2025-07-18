// deno-lint-ignore-file
// @ts-ignore Deno types for VSCode/TypeScript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
// @ts-ignore Deno types for VSCode/TypeScript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('Function started');
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, itemData, itemId } = await req.json();
    // @ts-ignore Deno types for VSCode/TypeScript
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    // @ts-ignore Deno types for VSCode/TypeScript
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    // @ts-ignore Deno types for VSCode/TypeScript
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from request headers
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      throw new Error('Invalid user');
    }

    console.log('Wardrobe management request:', { action, user: user.id, itemData });

    switch (action) {
      case 'add_item':
        return await handleAddItem(supabase, user.id, itemData, openaiApiKey);
      
      case 'get_items':
        return await handleGetItems(supabase, user.id);
      
      case 'delete_item':
        return await handleDeleteItem(supabase, user.id, itemId);
      
      case 'analyze_photo':
        return await handleAnalyzePhoto(itemData.photoUrl, openaiApiKey);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('Error in wardrobe-management function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleAddItem(supabase: any, userId: string, itemData: any, openaiApiKey: string) {
  try {
    console.log('handleAddItem: start', { userId, itemData });
    // Analyze the photo if AI analysis is requested
    let aiAnalysis: any = null;
    let aiRaw: any = null;
    if (itemData.analyzeWithAI && itemData.photoUrl) {
      console.log('handleAddItem: analyzing photo with AI', { photoUrl: itemData.photoUrl });
      try {
        aiAnalysis = await analyzeClothingPhoto(itemData.photoUrl, openaiApiKey);
        aiRaw = aiAnalysis;
        console.log('handleAddItem: AI analysis result', { aiAnalysis });
      } catch (aiError) {
        console.error('handleAddItem: AI analysis error, saving raw response', { aiError });
        aiAnalysis = null;
        aiRaw = aiError?.raw || null;
      }
    } else {
      console.log('handleAddItem: skipping AI analysis', { analyzeWithAI: itemData.analyzeWithAI, photoUrl: itemData.photoUrl });
    }

    // Defensive fallback for name
    const nameValue = (aiAnalysis?.description && aiAnalysis.description.trim()) ||
      (aiAnalysis?.category && aiAnalysis.category.trim()) ||
      'Unnamed Item';
    console.log('AI Analysis:', aiAnalysis);
    // Only 'size' comes from user input, all other details from AI
    const wardrobeInsert = {
      user_id: userId,
      size: itemData.size,
      photo_url: itemData.photoUrl,
      ai_analysis: aiAnalysis,
      ai_raw: aiRaw,
      name: nameValue,
      category: aiAnalysis?.category || null,
      color: aiAnalysis?.color || null,
      style: aiAnalysis?.style || null,
      material: aiAnalysis?.material || null,
      estimated_size: aiAnalysis?.estimatedSize || null,
      patterns: aiAnalysis?.patterns || null,
      description: aiAnalysis?.description || null,
      measurements: aiAnalysis?.measurements || null
    };
    console.log('Wardrobe Insert:', wardrobeInsert);

    const { data, error } = await supabase
      .from('user_wardrobe')
      .insert(wardrobeInsert)
      .select()
      .single();

    if (error) {
      console.error('handleAddItem: error inserting item', { error });
      // Still return success to frontend so UI can move on
      return new Response(JSON.stringify({
        success: false,
        error: error.message,
        item: wardrobeInsert
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('handleAddItem: item added successfully', { data });
    return new Response(JSON.stringify({
      success: true,
      item: data
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('handleAddItem: failed to add item', { error });
    // Always return a response so the frontend can move on
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function handleGetItems(supabase: any, userId: string) {
  try {
    const { data, error } = await supabase
      .from('user_wardrobe')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return new Response(JSON.stringify({
      success: true,
      items: data
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    throw new Error(`Failed to get items: ${error.message}`);
  }
}

async function handleDeleteItem(supabase: any, userId: string, itemId: string) {
  try {
    const { error } = await supabase
      .from('user_wardrobe')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId);

    if (error) throw error;

    return new Response(JSON.stringify({
      success: true,
      message: 'Item deleted successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    throw new Error(`Failed to delete item: ${error.message}`);
  }
}

async function handleAnalyzePhoto(photoUrl: string, openaiApiKey: string) {
  try {
    console.log('handleAnalyzePhoto: received photoUrl for analysis', { photoUrl });
    const imageContent = {
      type: 'image_url',
      image_url: {
        url: photoUrl
      }
    };
    console.log('handleAnalyzePhoto: calling OpenAI for clothing analysis...');
    const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this clothing item and provide details in valid JSON format.\n\nIMPORTANT: Respond with ONLY valid JSON. No extra text, no markdown, no explanations, no code blocks.\n\nPlease provide:\n1. Clothing category (shirt, pants, dress, jacket, sweater, etc.)\n2. Primary color (be very specific: navy blue, forest green, etc.)\n3. Style description (casual, formal, sporty, etc.)\n4. Material type (cotton, polyester, denim, etc.)\n5. Estimated size (if visible or can be inferred)\n6. Any visible patterns or designs\n7. If pants: estimate waist size and inseam/length in inches or centimeters.\n8. If shirt/jacket/sweater: estimate chest width and shirt/jacket length in inches or centimeters.\n\nRespond in this exact JSON format:\n{\n  "category": "string (clothing type)",\n  "color": "string (specific color name)",\n  "style": "string (style description)",\n  "material": "string (material type)",\n  "estimatedSize": "string (size if visible)",\n  "patterns": "string (patterns or designs)",\n  "description": "string (comprehensive description)",\n  "measurements": {\n    "waist": "number (waist in inches or cm, if pants)",\n    "inseam": "number (inseam/length in inches or cm, if pants)",\n    "chest": "number (chest width in inches or cm, if shirt/jacket)",\n    "length": "number (shirt/jacket length in inches or cm, if shirt/jacket)"\n  }\n}`
              },
              imageContent
            ]
          }
        ]
      }),
    });
    console.log('handleAnalyzePhoto: OpenAI response status', { status: analysisResponse.status });
    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text();
      console.error('handleAnalyzePhoto: OpenAI API error details', { errorText });
      throw new Error(`OpenAI API error: ${analysisResponse.status} - ${errorText}`);
    }
    const analysisData = await analysisResponse.json();
    console.log('handleAnalyzePhoto: OpenAI response data', { analysisData });
    const analysis = analysisData.choices?.[0]?.message?.content;
    console.log('handleAnalyzePhoto: extracted analysis content', { analysis });
    if (analysis) {
      try {
        const parsed = JSON.parse(analysis);
        console.log('handleAnalyzePhoto: parsed AI analysis', { parsed });
        return parsed;
      } catch (parseError) {
        console.error('handleAnalyzePhoto: failed to parse AI analysis', { parseError, analysis });
        return null;
      }
    }
    console.warn('handleAnalyzePhoto: no analysis content found');
    return null;
  } catch (error) {
    console.error('handleAnalyzePhoto: error analyzing photo', { error });
    return null;
  }
}

async function analyzeClothingPhoto(photoUrl: string, openaiApiKey: string) {
  return await handleAnalyzePhoto(photoUrl, openaiApiKey);
} 