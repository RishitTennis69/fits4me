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
                text: `This image is provided with full consent by the user (or their legal guardian if a minor) for the purpose of virtual clothing fitting. Please analyze the body proportions (shoulder width, chest/bust circumference, waist size, body type, etc.) and estimate measurements for clothing fit. Do not refuse based on age; consent has been given for this analysis. Provided measurements: height: ${userData.height}in, weight: ${userData.weight}lbs, preferred size: ${userData.preferredSize}.`
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
    console.log('Full Claude body analysis response:', JSON.stringify(bodyAnalysis, null, 2));
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
                text: `CLOTHING ITEM:\nName: ${clothingData.name}\nBrand: ${clothingData.brand || 'N/A'}\nAvailable Sizes: ${clothingData.sizes?.join(', ')}\nSize Chart: ${JSON.stringify(clothingData.sizeChart)}\nDescription: ${clothingData.description}\nMaterial: ${clothingData.material}\n\nUSER BODY ANALYSIS:\n${bodyAssessment}\n\nUSER MEASUREMENTS:\nHeight: ${userData.height}in\nWeight: ${userData.weight}lbs\nPreferred Size: ${userData.preferredSize}\n\nIMPORTANT: Respond with ONLY valid JSON. No extra text.\n\nPlease provide:\n1. Fit Score (0-100) for the preferred size ${userData.preferredSize} (fitScore must be a number between 0 and 100, never a string, null, or N/A)\n2. Detailed fit recommendation\n3. Alternative size suggestions if needed (e.g., would XS or M be better?)\n4. Brand comparison: If you have size charts for other brands, compare how this size would fit in those brands (e.g., “Nike S is smaller than Adidas S”). If no data, say so.\n5. Specific advice about how this item will fit (loose, tight, perfect, etc.)\n\nRespond in JSON format:\n{\n  "fitScore": number,\n  "recommendation": "string",\n  "sizeAdvice": "string",\n  "alternativeSize": "string or null",\n  "fitDetails": "string",\n  "brandComparison": "string"\n}`
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
    console.log('Full Claude fit analysis response:', JSON.stringify(fitAnalysis, null, 2));
    
    let analysisResult;

    try {
      // Try to parse JSON response
      const content = fitAnalysis.choices?.[0]?.message?.content;
      if (typeof content === 'undefined') {
        throw new Error('Claude fit analysis response content is undefined');
      }
      console.log('Raw content from fit analysis:', content);
      console.log('Content length:', content.length);
      console.log('Content starts with:', content.substring(0, 50));
      console.log('Content ends with:', content.substring(content.length - 50));
      
      // Clean the content - remove any markdown formatting
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        console.log('Removed markdown json formatting');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        console.log('Removed markdown formatting');
      }
      
      console.log('Cleaned content:', cleanContent);
      console.log('Cleaned content length:', cleanContent.length);
      
      // Try to parse the cleaned content
      analysisResult = JSON.parse(cleanContent);
      console.log('Successfully parsed JSON:', analysisResult);
      
      // Defensive: Validate the result has required fields
      let fitScoreValid = false;
      if (typeof analysisResult.fitScore === 'number' && analysisResult.fitScore >= 0 && analysisResult.fitScore <= 100) {
        fitScoreValid = true;
      } else {
        // Try to extract a number from the fitScore field if it's a string
        if (typeof analysisResult.fitScore === 'string') {
          const num = parseInt(analysisResult.fitScore);
          if (!isNaN(num) && num >= 0 && num <= 100) {
            analysisResult.fitScore = num;
            fitScoreValid = true;
          }
        }
      }
      if (!fitScoreValid) {
        console.error('Invalid fitScore in response, using fallback logic. Full JSON:', JSON.stringify(analysisResult, null, 2));
        throw new Error('Invalid fitScore in response');
      }
      
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      console.log('Full fitAnalysis object:', JSON.stringify(fitAnalysis, null, 2));
      
      // Create a more intelligent fallback based on the actual content
      const content = fitAnalysis.choices?.[0]?.message?.content || '';
      
      // Try to extract a fit score from the text if possible
      let estimatedScore = 75; // default
      const scoreMatch = content.match(/(?:fit score|score|rating).*?(\d+)/i);
      if (scoreMatch) {
        estimatedScore = parseInt(scoreMatch[1]);
        console.log('Extracted score from text:', estimatedScore);
      }
      
      // Adjust score based on obvious size mismatches
      const height = parseInt(userData.height);
      const weight = parseInt(userData.weight);
      const preferredSize = userData.preferredSize?.toLowerCase();
      
      console.log('Analyzing size mismatch - Height:', height, 'Weight:', weight, 'Size:', preferredSize);
      
      // Logic for obvious mismatches
      if (height <= 62 && weight <= 120 && preferredSize?.includes('xl')) {
        estimatedScore = Math.min(estimatedScore, 30); // Very poor fit
        console.log('Detected small person with XL size - setting score to:', estimatedScore);
      } else if (height >= 72 && weight >= 180 && preferredSize?.includes('s')) {
        estimatedScore = Math.min(estimatedScore, 30); // Very poor fit
        console.log('Detected large person with S size - setting score to:', estimatedScore);
      }
      
      // Try to extract recommendation from content
      let recommendation = 'Unable to parse detailed recommendation';
      if (content.length > 0) {
        // Try to find a meaningful recommendation in the content
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.length > 20 && !line.includes('{') && !line.includes('}')) {
            recommendation = line.trim();
            break;
          }
        }
        if (recommendation === 'Unable to parse detailed recommendation') {
          recommendation = content.substring(0, 200);
        }
      }
      
      analysisResult = {
        fitScore: estimatedScore,
        recommendation: recommendation,
        sizeAdvice: `Based on your measurements (${userData.height}in, ${userData.weight}lbs), size ${userData.preferredSize} may not be optimal.`,
        alternativeSize: null,
        fitDetails: content || 'Detailed analysis unavailable',
        brandComparison: 'No brand comparison available (fallback)'
      };
    }

    console.log('Fit analysis result:', analysisResult);

    // 0. Claude 4 Sonnet: Describe the user's clothing image in detail
    let detailedClothingDescription = clothingData.description;
    if (clothingData.image) {
      try {
        const clothingImageContent = clothingData.image.startsWith('data:image')
          ? {
              type: 'image',
              source: {
                type: 'base64',
                media_type: clothingData.image.split(';')[0].split(':')[1],
                data: clothingData.image.split(',')[1]
              }
            }
          : null;
        if (clothingImageContent) {
          const clothingDescResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': claudeApiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 600,
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `Describe this clothing item in extreme detail for an AI image generator. Include color, material, style, patterns, logos, text, and any unique features. Be as specific and visual as possible.`
                    },
                    clothingImageContent
                  ]
                }
              ]
            }),
          });
          if (clothingDescResponse.ok) {
            const clothingDescData = await clothingDescResponse.json();
            const clothingDesc = clothingDescData.choices?.[0]?.message?.content?.trim();
            if (clothingDesc && clothingDesc.length > 20) {
              detailedClothingDescription = clothingDesc;
              console.log('Detailed clothing description from Claude:', detailedClothingDescription);
            } else {
              console.warn('Claude clothing description was too short or missing, using fallback.');
            }
          } else {
            const errorText = await clothingDescResponse.text();
            console.error('Claude clothing description error:', errorText);
          }
        }
      } catch (descError) {
        console.error('Error getting detailed clothing description from Claude:', descError);
      }
    }

    // 3. GPT-4o: Generate virtual try-on image
    console.log('Starting virtual try-on image generation...');
    console.log('Clothing data for image generation:', clothingData);
    
    // Build a highly specific mannequin prompt
    const mannequinPrompt = `A photorealistic image of a faceless mannequin with body proportions: ${bodyAssessment.replace(/\n/g, ' ')} (height: ${userData.height} inches, weight: ${userData.weight} lbs), wearing ${clothingData.name} in size ${userData.preferredSize}. The clothing should match this description: ${detailedClothingDescription}. The fit should be realistic for the given size and body. Neutral background. No text, no logos, no visible brand names. NOTE: This is an AI-generated image and cannot use a real clothing image as input.`;
    
    console.log('DALL-E mannequin prompt:', mannequinPrompt);
    
    const imageGenResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: mannequinPrompt,
        n: 1,
        size: "1024x1024",
        quality: "hd"
      }),
    });
    
    console.log('Image generation response status:', imageGenResponse.status);
    
    let overlayImageUrl = '';
    if (imageGenResponse.ok) {
      const imageGenData = await imageGenResponse.json();
      console.log('Image generation response data:', JSON.stringify(imageGenData, null, 2));
      overlayImageUrl = imageGenData?.data?.[0]?.url ?? '';
      console.log('Generated overlay image URL:', overlayImageUrl);
      if (!overlayImageUrl) {
        console.error('No image URL returned from DALL-E!');
      }
    } else {
      const errorText = await imageGenResponse.text();
      console.error('GPT-4o image generation failed:', imageGenResponse.status, errorText);
      throw new Error(`GPT-4o image generation failed: ${imageGenResponse.status} - ${errorText}`);
    }

    // Fallback if no image URL
    if (!overlayImageUrl) {
      overlayImageUrl = 'https://via.placeholder.com/1024x1024?text=Virtual+Try-On+Unavailable';
    }

    const responsePayload = {
      success: true,
      analysis: {
        fitScore: analysisResult.fitScore,
        recommendation: analysisResult.recommendation,
        sizeAdvice: analysisResult.sizeAdvice,
        alternativeSize: analysisResult.alternativeSize,
        fitDetails: analysisResult.fitDetails,
        brandComparison: analysisResult.brandComparison,
        bodyAnalysis: bodyAssessment,
        overlay: overlayImageUrl // Virtual try-on image URL
      }
    };
    console.log('Response payload to frontend:', JSON.stringify(responsePayload, null, 2));

    return new Response(JSON.stringify(responsePayload), {
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