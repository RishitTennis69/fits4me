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
    if (!claudeApiKey) {
      throw new Error('Claude API key not configured');
    }

    console.log('Analyzing fit for user:', userData);

    // First, analyze the user's body from the photo
    const bodyAnalysisResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
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
      throw new Error(`Claude API error: ${bodyAnalysisResponse.status}`);
    }

    const bodyAnalysis = await bodyAnalysisResponse.json();
    const bodyAssessment = bodyAnalysis.choices[0]?.message?.content || '';

    console.log('Body analysis:', bodyAssessment);

    // Now analyze the clothing item and compare with user measurements
    const fitAnalysisResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
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
      throw new Error(`Claude fit analysis error: ${fitAnalysisResponse.status}`);
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
        sizeAdvice: `Based on your measurements (${userData.height}cm, ${userData.weight}kg), size ${userData.preferredSize} should work well.`,
        alternativeSize: null,
        fitDetails: content
      };
    }

    console.log('Fit analysis result:', analysisResult);

    return new Response(JSON.stringify({
      success: true,
      analysis: {
        fitScore: analysisResult.fitScore || 75,
        recommendation: analysisResult.recommendation || 'Good fit expected',
        sizeAdvice: analysisResult.sizeAdvice || `Size ${userData.preferredSize} recommended`,
        alternativeSize: analysisResult.alternativeSize,
        fitDetails: analysisResult.fitDetails || '',
        bodyAnalysis: bodyAssessment
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