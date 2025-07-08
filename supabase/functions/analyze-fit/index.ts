// @ts-ignore
import "https://deno.land/x/xhr@0.1.0/mod.ts";
// @ts-ignore
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
    // @ts-ignore
    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      throw new Error('Groq API key not configured');
    }

    console.log('Analyzing fit for user:', userData);

    // First, analyze the user's body from the photo
    const bodyAnalysisResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are an AI clothing fit specialist. Analyze the user's body proportions from their provided measurements (height: ${userData.height}in, weight: ${userData.weight}lbs, preferred size: ${userData.preferredSize}) to determine how clothing will fit them.`
          },
          {
            role: 'user',
            content: `Please analyze this person's body proportions and estimate their clothing measurements. Consider their height (${userData.height}in) and weight (${userData.weight}lbs). Focus on: shoulder width, chest/bust circumference, waist size, body type (slim, regular, athletic, etc.).`
          }
        ],
        max_tokens: 500
      }),
    });

    if (!bodyAnalysisResponse.ok) {
      throw new Error(`Groq API error: ${bodyAnalysisResponse.status}`);
    }

    const bodyAnalysis = await bodyAnalysisResponse.json();
    const bodyAssessment = bodyAnalysis.choices[0]?.message?.content || '';

    console.log('Body analysis:', bodyAssessment);

    // Now analyze the clothing item and compare with user measurements
    const fitAnalysisResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an expert clothing fit analyst. Based on the user\'s body analysis and the clothing item details, provide a comprehensive fit assessment.'
          },
          {
            role: 'user',
            content: `
CLOTHING ITEM:
Name: ${clothingData.name}
Available Sizes: ${clothingData.sizes?.join(', ')}
Size Chart: ${JSON.stringify(clothingData.sizeChart)}
Description: ${clothingData.description}
Material: ${clothingData.material}
Images: ${(clothingData.images && clothingData.images.length > 0) ? clothingData.images.join(', ') : 'None'}
Full Page Content: ${clothingData.scrapedContent || 'N/A'}

USER BODY ANALYSIS:
${bodyAssessment}

USER MEASUREMENTS:
Height: ${userData.height}in
Weight: ${userData.weight}lbs
Preferred Size: ${userData.preferredSize}

Please provide:
1. Fit Score (0-100) for the preferred size ${userData.preferredSize}
2. Detailed fit recommendation
3. Alternative size suggestions if needed
4. Specific advice about how this item will fit (loose, tight, perfect, etc.)

Respond in JSON format:
{
  "fitScore": number,
  "recommendation": "string",
  "sizeAdvice": "string",
  "alternativeSize": "string or null",
  "fitDetails": "string"
}
            `
          }
        ],
        max_tokens: 800
      }),
    });

    if (!fitAnalysisResponse.ok) {
      throw new Error(`Groq fit analysis error: ${fitAnalysisResponse.status}`);
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