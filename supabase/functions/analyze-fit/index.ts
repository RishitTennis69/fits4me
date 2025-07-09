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

    // Check if userPhoto is base64 or URL and handle accordingly
    let imageContent;
    if (userPhoto.startsWith('data:image')) {
      // It's already a base64 image
      imageContent = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: userPhoto.split(';')[0].split(':')[1],
          data: userPhoto.split(',')[1]
        }
      };
    } else {
      // It's a URL, try to convert to base64
      try {
        const imageResponse = await fetch(userPhoto);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image: ${imageResponse.status}`);
        }
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        
        imageContent = {
          type: 'image',
          source: {
            type: 'base64',
            media_type: contentType,
            data: base64
          }
        };
      } catch (imageError) {
        console.error('Failed to convert image to base64:', imageError);
        throw new Error(`Failed to process image: ${imageError.message}`);
      }
    }

    // 1. Claude 4 Sonnet: Analyze the user's body from the photo
    const bodyAnalysisResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are an AI clothing fit specialist. Analyze the user's body proportions from their photo and their provided measurements (height: ${userData.height}in, weight: ${userData.weight}lbs, preferred size: ${userData.preferredSize}) to determine how clothing will fit them. Please analyze this person's body proportions and estimate their clothing measurements. Focus on: shoulder width, chest/bust circumference, waist size, body type (slim, regular, athletic, etc.).`
              },
              imageContent
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
    console.log('Body analysis response structure:', JSON.stringify(bodyAnalysis, null, 2));
    const bodyAssessment = bodyAnalysis.choices?.[0]?.message?.content || '';

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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `CLOTHING ITEM:
Name: ${clothingData.name}
Available Sizes: ${clothingData.sizes?.join(', ')}
Size Chart: ${JSON.stringify(clothingData.sizeChart)}
Description: ${clothingData.description}
Material: ${clothingData.material}

USER BODY ANALYSIS:
${bodyAssessment}

USER MEASUREMENTS:
Height: ${userData.height}in
Weight: ${userData.weight}lbs
Preferred Size: ${userData.preferredSize}

IMPORTANT: You must respond with ONLY valid JSON. No additional text before or after the JSON.

Analyze the fit and respond with this exact JSON structure:
{
  "fitScore": <number between 0-100>,
  "recommendation": "<detailed fit recommendation>",
  "sizeAdvice": "<specific size advice>",
  "alternativeSize": "<alternative size or null>",
  "fitDetails": "<detailed explanation of how the item will fit>"
}

Consider:
- A 5'2" person at 100lbs wearing XXL would likely be a very poor fit (low score)
- A 6'0" person at 200lbs wearing S would likely be a very poor fit (low score)
- Be realistic about body proportions and sizing
- Lower scores for obvious size mismatches
- Higher scores for appropriate size selections`
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
    console.log('Fit analysis response structure:', JSON.stringify(fitAnalysis, null, 2));
    
    let analysisResult;

    try {
      // Try to parse JSON response
      const content = fitAnalysis.choices?.[0]?.message?.content || '{}';
      console.log('Raw content from fit analysis:', content);
      
      // Clean the content - remove any markdown formatting
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      console.log('Cleaned content:', cleanContent);
      
      // Try to parse the cleaned content
      analysisResult = JSON.parse(cleanContent);
      console.log('Successfully parsed JSON:', analysisResult);
      
      // Validate the result has required fields
      if (typeof analysisResult.fitScore !== 'number' || analysisResult.fitScore < 0 || analysisResult.fitScore > 100) {
        throw new Error('Invalid fitScore in response');
      }
      
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      console.log('Content that failed to parse:', fitAnalysis.choices?.[0]?.message?.content);
      
      // Create a more intelligent fallback based on the actual content
      const content = fitAnalysis.choices?.[0]?.message?.content || '';
      
      // Try to extract a fit score from the text if possible
      let estimatedScore = 75; // default
      const scoreMatch = content.match(/(?:fit score|score|rating).*?(\d+)/i);
      if (scoreMatch) {
        estimatedScore = parseInt(scoreMatch[1]);
      }
      
      // Adjust score based on obvious size mismatches
      const height = parseInt(userData.height);
      const weight = parseInt(userData.weight);
      const preferredSize = userData.preferredSize?.toLowerCase();
      
      // Logic for obvious mismatches
      if (height <= 62 && weight <= 120 && preferredSize?.includes('xl')) {
        estimatedScore = Math.min(estimatedScore, 30); // Very poor fit
      } else if (height >= 72 && weight >= 180 && preferredSize?.includes('s')) {
        estimatedScore = Math.min(estimatedScore, 30); // Very poor fit
      }
      
      analysisResult = {
        fitScore: estimatedScore,
        recommendation: content.substring(0, 200) || 'Unable to parse detailed recommendation',
        sizeAdvice: `Based on your measurements (${userData.height}in, ${userData.weight}lbs), size ${userData.preferredSize} may not be optimal.`,
        alternativeSize: null,
        fitDetails: content || 'Detailed analysis unavailable'
      };
    }

    console.log('Fit analysis result:', analysisResult);

    // 3. GPT-4o: Generate virtual try-on image
    console.log('Starting virtual try-on image generation...');
    console.log('Clothing data for image generation:', clothingData);
    
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
    
    console.log('Image generation response status:', imageGenResponse.status);
    
    let overlayImageUrl = null;
    if (imageGenResponse.ok) {
      const imageGenData = await imageGenResponse.json();
      console.log('Image generation response data:', JSON.stringify(imageGenData, null, 2));
      overlayImageUrl = imageGenData?.data?.[0]?.url ?? null;
      console.log('Generated overlay image URL:', overlayImageUrl);
    } else {
      const errorText = await imageGenResponse.text();
      console.error('GPT-4o image generation failed:', imageGenResponse.status, errorText);
      throw new Error(`GPT-4o image generation failed: ${imageGenResponse.status} - ${errorText}`);
    }

    return new Response(JSON.stringify({
      success: true,
      analysis: {
        fitScore: analysisResult.fitScore,
        recommendation: analysisResult.recommendation,
        sizeAdvice: analysisResult.sizeAdvice,
        alternativeSize: analysisResult.alternativeSize,
        fitDetails: analysisResult.fitDetails,
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