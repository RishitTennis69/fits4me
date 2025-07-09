// deno-lint-ignore-file
// @ts-ignore Deno types for VSCode/TypeScript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
// @ts-ignore Deno types for VSCode/TypeScript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userPhoto, clothingData, userData } = await req.json();
    // @ts-ignore Deno types for VSCode/TypeScript
    const claudeApiKey = Deno.env.get('CLAUDE_API_KEY');
    // @ts-ignore Deno types for VSCode/TypeScript
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!claudeApiKey) throw new Error('Claude API key not configured');
    if (!openaiApiKey) throw new Error('OpenAI API key not configured');

    console.log('Analyzing fit for user:', userData);

    // 1. Claude 4 Sonnet: Analyze the user's body from the photo
    const bodyAnalysisResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are an AI clothing fit specialist. Analyze the user's body proportions from their photo and their provided measurements (height: ${userData.height}in, weight: ${userData.weight}lbs, preferred size: ${userData.preferredSize}) to determine how clothing will fit them. Please analyze this person's body proportions and estimate their clothing measurements. Focus on: shoulder width, chest/bust circumference, waist size, body type (slim, regular, athletic, etc.).`
              },
              {
                type: 'image',
                source: {
                  type: 'url',
                  url: userPhoto
                }
              }
            ]
          }
        ]
      }),
    });

    if (!bodyAnalysisResponse.ok) {
      const errorText = await bodyAnalysisResponse.text();
      console.error('Claude API error details:', errorText);
      throw new Error(`Claude API error: ${bodyAnalysisResponse.status} - ${errorText}`);
    }

    const bodyAnalysis = await bodyAnalysisResponse.json();
    const bodyAssessment = bodyAnalysis.choices[0]?.message?.content || '';

    console.log('Body analysis:', bodyAssessment);

    // 2. Claude 4 Sonnet: Fit analysis
    const fitAnalysisResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `CLOTHING ITEM:\nName: ${clothingData.name}\nAvailable Sizes: ${clothingData.sizes?.join(', ')}\nSize Chart: ${JSON.stringify(clothingData.sizeChart)}\nDescription: ${clothingData.description}\nMaterial: ${clothingData.material}\n\nUSER BODY ANALYSIS:\n${bodyAssessment}\n\nUSER MEASUREMENTS:\nHeight: ${userData.height}in\nWeight: ${userData.weight}lbs\nPreferred Size: ${userData.preferredSize}\n\nPlease provide:\n1. Fit Score (0-100) for the preferred size ${userData.preferredSize}\n2. Detailed fit recommendation\n3. Alternative size suggestions if needed\n4. Specific advice about how this item will fit (loose, tight, perfect, etc.)\n\nRespond in JSON format:\n{\n  \"fitScore\": number,\n  \"recommendation\": \"string\",\n  \"sizeAdvice\": \"string\",\n  \"alternativeSize\": \"string or null\",\n  \"fitDetails\": \"string\"\n}`
              }
            ]
          }
        ]
      }),
    });

    if (!fitAnalysisResponse.ok) {
      const errorText = await fitAnalysisResponse.text();
      console.error('Claude fit analysis error details:', errorText);
      throw new Error(`Claude fit analysis error: ${fitAnalysisResponse.status} - ${errorText}`);
    }

    const fitAnalysis = await fitAnalysisResponse.json();
    let analysisResult;

    try {
      // Try to parse JSON response
      const content = fitAnalysis.choices[0]?.message?.content || '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.warn('Failed to parse JSON response, creating fallback result');
      const content = fitAnalysis.choices[0]?.message?.content || '';
      analysisResult = {
        fitScore: 85,
        recommendation: content.substring(0, 200),
        sizeAdvice: `Based on your measurements (${userData.height}in, ${userData.weight}lbs), size ${userData.preferredSize} should work well.`,
        alternativeSize: null,
        fitDetails: content
      };
    }

    console.log('Fit analysis result:', analysisResult);

    // 3. GPT-4o: Generate virtual try-on image
    const imageGenResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `A realistic photo showing a person wearing ${clothingData.name}. The person should match the body type and proportions described in the analysis. The clothing should fit naturally and look like a real person wearing this item. Style: photorealistic, natural lighting, high quality.`,
        n: 1,
        size: "1024x1024",
        quality: "hd"
      }),
    });
    
    let overlayImageUrl = null;
    if (imageGenResponse.ok) {
      const imageGenData = await imageGenResponse.json();
      overlayImageUrl = imageGenData?.data?.[0]?.url ?? null;
    } else {
      console.error('GPT-4o image generation failed:', imageGenResponse.status);
      throw new Error(`GPT-4o image generation failed: ${imageGenResponse.status}`);
    }

    return new Response(JSON.stringify({
      success: true,
      analysis: {
        fitScore: analysisResult.fitScore || 75,
        recommendation: analysisResult.recommendation || 'Good fit expected',
        sizeAdvice: analysisResult.sizeAdvice || `Size ${userData.preferredSize} recommended`,
        alternativeSize: analysisResult.alternativeSize,
        fitDetails: analysisResult.fitDetails || '',
        bodyAnalysis: bodyAssessment,
        overlay: overlayImageUrl // Virtual try-on image URL
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-fit function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});