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
    const { userPhoto, clothingData, clothingItems, userData, isMultiItem, wardrobeItem } = await req.json();
    // @ts-ignore Deno types for VSCode/TypeScript
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) throw new Error('OpenAI API key not configured');

    console.log('Analyzing fit for user:', userData);
    console.log('Multi-item mode:', isMultiItem);
    console.log('Clothing items:', clothingItems);
    console.log('Wardrobe item:', wardrobeItem);

    // Handle both single item and multi-item modes, including wardrobe items
    let itemsToAnalyze: any[] = [];
    if (isMultiItem) {
      itemsToAnalyze = clothingItems || [];
      // Add wardrobe item if provided
      if (wardrobeItem) {
        // Convert wardrobe item to clothing data format
        const wardrobeClothingData = {
          id: wardrobeItem.id,
          name: wardrobeItem.name,
          price: 'Owned Item',
          sizes: [wardrobeItem.size || 'M'],
          images: [wardrobeItem.photo_url],
          sizeChart: {}, // No size chart for owned items
          selectedSize: wardrobeItem.size || 'M',
          description: wardrobeItem.ai_analysis?.description || wardrobeItem.name,
          category: wardrobeItem.category,
          color: wardrobeItem.color,
          isWardrobeItem: true
        };
        itemsToAnalyze.push(wardrobeClothingData);
      }
    } else {
      itemsToAnalyze = [clothingData];
    }
    
    console.log('Items to analyze:', itemsToAnalyze);

    // Check if userPhoto is base64 or URL and handle accordingly
    let imageContent;
    if (userPhoto.startsWith('data:image')) {
      // It's already a base64 image
      imageContent = {
        type: 'image_url',
        image_url: {
          url: userPhoto
        }
      };
    } else {
      // It's a URL
      imageContent = {
        type: 'image_url',
        image_url: {
          url: userPhoto
        }
      };
    }

    // 1. OpenAI GPT-4o-mini: Analyze the user's body from the photo
    let bodyAssessment = '';
    let detailedMeasurements: any = null;
    let usedManualMeasurements = false;
    let userAppearanceDescription = '';
    const bodyAnalysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `This image is of an adult (over 18) and is provided with full consent by the user for the purpose of virtual clothing fitting. \n\nPlease analyze the body proportions and estimate precise measurements for clothing fit.\n\nIMPORTANT: Respond with ONLY valid JSON. No extra text, no markdown, no explanations, no code blocks.\n\nCRITICAL: You must estimate the person's height from the image. Look at their proportions, compare to objects in the background, or use visual cues to estimate their actual height in inches. Do NOT assume a default height.\n\nAnalyze the body and provide:\n1. Body type assessment\n2. Precise measurements in inches (including estimated height from image)\n3. Fit recommendations\n\nRespond in this exact JSON format:\n{\n  "bodyType": "slim|average|full",\n  "bodyShape": "rectangular|triangle|inverted-triangle|hourglass",\n  "estimatedHeight": number,\n  "estimatedWeight": number,\n  "measurements": {\n    "chest": number,\n    "waist": number,\n    "hips": number,\n    "shoulders": number,\n    "armLength": number,\n    "inseam": number\n  },\n  "fitNotes": "string describing body proportions and fit considerations"\n}`
              },
              imageContent
            ]
          }
        ]
      }),
    });
    if (!bodyAnalysisResponse.ok) {
      const errorText = await bodyAnalysisResponse.text();
      console.error('OpenAI API error details:', errorText);
      throw new Error(`OpenAI API error: ${bodyAnalysisResponse.status} - ${errorText}`);
    }
    const bodyAnalysis = await bodyAnalysisResponse.json();
    console.log('Full OpenAI body analysis response:', JSON.stringify(bodyAnalysis, null, 2));
    let bodyContent = bodyAnalysis.choices?.[0]?.message?.content;
    if (bodyContent) {
      try {
        let jsonBlock = bodyContent.trim();
        if (jsonBlock.startsWith('{') && jsonBlock.endsWith('}')) {
          detailedMeasurements = JSON.parse(jsonBlock);
          console.log('Successfully parsed detailed measurements:', detailedMeasurements);
        } else {
          const match = jsonBlock.match(/\{[\s\S]*\}/);
          if (match) {
            detailedMeasurements = JSON.parse(match[0]);
            console.log('Parsed detailed measurements from regex-extracted block.');
          }
        }
        if (detailedMeasurements && detailedMeasurements.measurements) {
          // Use AI-estimated height and weight if available
          const estimatedHeight = detailedMeasurements.estimatedHeight || userData.height;
          const estimatedWeight = detailedMeasurements.estimatedWeight || userData.weight;
          bodyAssessment = `Detailed body analysis: ${detailedMeasurements.bodyType} body type, ${detailedMeasurements.bodyShape} shape. Estimated height: ${estimatedHeight} inches, estimated weight: ${estimatedWeight} lbs. Measurements: Chest ${detailedMeasurements.measurements.chest}", Waist ${detailedMeasurements.measurements.waist}", Shoulders ${detailedMeasurements.measurements.shoulders}". ${detailedMeasurements.fitNotes}`;
          // Update userData with AI estimates for consistency
          userData.height = estimatedHeight;
          userData.weight = estimatedWeight;
        } else {
          bodyAssessment = bodyContent;
        }
      } catch (parseError) {
        console.error('Failed to parse body analysis JSON:', parseError);
        bodyAssessment = bodyContent;
      }
    }
    // Fallback: If OpenAI refuses or fails to analyze the body, use only manual measurements
    if (!bodyAssessment || /not able to analyze|cannot analyze|refuse|privacy protection|error|unavailable/i.test(bodyAssessment)) {
      usedManualMeasurements = true;
      bodyAssessment = `Manual fallback: User-provided measurements only. Height: ${userData.height}in, Weight: ${userData.weight}lbs, Preferred Size: ${userData.preferredSize}.`;
      console.warn('OpenAI refused or failed body analysis. Using manual measurements only.');
    }
    // BULLETPROOF BODY ASSESSMENT: Ensure we always have a valid body assessment
    if (!bodyAssessment || bodyAssessment.trim().length < 10) {
      bodyAssessment = `Body analysis: Height ${userData.height} inches, Weight ${userData.weight} lbs, Preferred size ${userData.preferredSize}. Standard body proportions assumed.`;
      usedManualMeasurements = true;
      console.warn('Body assessment was invalid, using fallback.');
    }
    console.log('Body analysis:', bodyAssessment);

    // 1b. Get a detailed user appearance description for DALL-E
    // This is a new GPT-4o-mini call
    const appearanceDescriptionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `This image is of an adult (over 18) and is provided with full consent by the user for the purpose of virtual clothing fitting.\n\nDescribe the person's appearance in vivid, visual detail for the purpose of AI image generation. Include: face shape, skin tone, hair color and style, eye color, body type, body shape, and any other visible features.\n\nIMPORTANT: Respond with ONLY valid JSON. No extra text, no markdown, no explanations, no code blocks.\n\nRespond in this exact JSON format:\n{\n  "face": "string (face shape, features, expression)",\n  "skinTone": "string (detailed skin tone)",\n  "hair": "string (color, length, style)",\n  "eyes": "string (color, shape)",\n  "body": "string (type, shape, build)",\n  "other": "string (any other visible features)"\n}`
              },
              imageContent
            ]
          }
        ]
      }),
    });
    if (appearanceDescriptionResponse.ok) {
      const appearanceData = await appearanceDescriptionResponse.json();
      const appearanceContent = appearanceData.choices?.[0]?.message?.content;
      if (appearanceContent) {
        try {
          const appearanceJson = JSON.parse(appearanceContent);
          userAppearanceDescription = `A person with ${appearanceJson.face}, ${appearanceJson.skinTone} skin, ${appearanceJson.hair} hair, ${appearanceJson.eyes} eyes, and a ${appearanceJson.body}. ${appearanceJson.other}`;
        } catch (e) {
          userAppearanceDescription = '';
        }
      }
    }

    // 2. AI Fit Scores: Ask AI for only individual fit scores in JSON
    const fitScorePrompt = `You are a virtual clothing fit expert. Given the user's body measurements and the following clothing items, analyze the FIT ONLY and provide:
1. An individual fit score (0-100) for each item, with a brief reason
2. A recommendation for each item (e.g., fits well, too tight, too loose, consider another size)
3. IMPORTANT: Do NOT comment on style, color, or whether the items look good together. Do NOT judge outfit compatibility, color harmony, or style cohesion. Only analyze fit.
4. A comprehensive JSON response with this structure:
{
  "individualScores": [
    {
      "itemName": string,
      "fitScore": number,
      "reason": string,
      "recommendation": string
    }
  ]
}
Respond with ONLY valid JSON. No extra text, no markdown, no explanations, no code blocks.`;
    const fitScoreAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: fitScorePrompt },
              { type: 'text', text: `User measurements: ${JSON.stringify(detailedMeasurements?.measurements || userData)}\nClothing items: ${JSON.stringify(itemsToAnalyze)}` }
            ]
          }
        ]
      }),
    });
    if (!fitScoreAIResponse.ok) {
      const errorText = await fitScoreAIResponse.text();
      console.error('OpenAI fit score API error details:', errorText);
      throw new Error(`OpenAI fit score API error: ${fitScoreAIResponse.status} - ${errorText}`);
    }
    const fitScoreAIData = await fitScoreAIResponse.json();
    let fitScoreAIContent = fitScoreAIData.choices?.[0]?.message?.content;
    let aiFitScores = null;
    if (fitScoreAIContent) {
      try {
        let jsonBlock = fitScoreAIContent.trim();
        if (jsonBlock.startsWith('{') && jsonBlock.endsWith('}')) {
          aiFitScores = JSON.parse(jsonBlock);
        } else {
          const match = jsonBlock.match(/\{[\s\S]*\}/);
          if (match) {
            aiFitScores = JSON.parse(match[0]);
          }
        }
        console.log('AI fit scores:', aiFitScores);
      } catch (e) {
        console.error('Failed to parse AI fit scores JSON:', e);
      }
    }
    // Use AI's fit scores if available
    let individualScores: Array<{
      itemName: string;
      fitScore: number;
      reason: string;
      recommendation: string;
    }> = [];
    if (aiFitScores && typeof aiFitScores === 'object' && aiFitScores !== null) {
      if (Array.isArray((aiFitScores as any).individualScores)) {
        individualScores = (aiFitScores as any).individualScores;
      }
    }

    // 2. AI Clothing Analysis: Analyze all clothing items in detail for virtual try-on
    let allClothingDescriptions: string[] = [];
    let allExtractedColors: string[] = [];
    let allExtractedTextLogos: string[] = [];
    let allClothingStyleAnalyses: string[] = [];
    
    // Analyze each clothing item
    for (let i = 0; i < itemsToAnalyze.length; i++) {
      const item = itemsToAnalyze[i];
      console.log(`Analyzing clothing item ${i + 1}:`, item.name);
      
      let detailedClothingDescription = item.description || item.name;
      let extractedTextLogo = '';
      let extractedColor = '';
      let clothingStyleAnalysis = '';
      
      if (item.images && item.images.length > 0) {
        try {
          console.log(`Analyzing clothing image ${i + 1} for detailed description...`);
          
          const clothingImageContent = {
            type: 'image_url',
            image_url: {
              url: item.images[0]
            }
          };
          
          const clothingAnalysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
                      text: `Analyze this clothing item in extreme detail for virtual try-on generation.

IMPORTANT: Respond with ONLY valid JSON. No extra text, no markdown, no explanations, no code blocks.

Please provide:
1. Primary color (be very specific: navy blue, forest green, etc.)
2. Any visible text, logos, or numbers on the item
3. Material and fabric details
4. Style and fit characteristics
5. Unique features or design elements
6. Overall aesthetic and visual appeal

Respond in this exact JSON format:
{
  "primaryColor": "string (specific color name)",
  "textLogoNumber": "string (any visible text/logo/number or 'none')",
  "materialDetails": "string (detailed material description)",
  "styleCharacteristics": "string (style, fit, design details)",
  "uniqueFeatures": "string (special features or design elements)",
  "aesthetic": "string (overall visual appeal and style)",
  "detailedDescription": "string (comprehensive description for AI image generation)"
}`
                    },
                    clothingImageContent
                  ]
                }
              ]
            }),
          });

          if (clothingAnalysisResponse.ok) {
            const clothingAnalysisData = await clothingAnalysisResponse.json();
            const clothingAnalysis = clothingAnalysisData.choices?.[0]?.message?.content;
            
            if (clothingAnalysis) {
              try {
                const analysis = JSON.parse(clothingAnalysis);
                console.log(`Clothing analysis result for item ${i + 1}:`, analysis);
                
                extractedColor = analysis.primaryColor || '';
                extractedTextLogo = analysis.textLogoNumber || '';
                detailedClothingDescription = analysis.detailedDescription || item.name;
                clothingStyleAnalysis = `Style: ${analysis.styleCharacteristics}. Features: ${analysis.uniqueFeatures}. Aesthetic: ${analysis.aesthetic}. Material: ${analysis.materialDetails}`;
                
                console.log(`Enhanced clothing description for item ${i + 1}:`, {
                  color: extractedColor,
                  textLogo: extractedTextLogo,
                  description: detailedClothingDescription,
                  styleAnalysis: clothingStyleAnalysis
                });
              } catch (parseError) {
                console.error(`Failed to parse clothing analysis JSON for item ${i + 1}:`, parseError);
                detailedClothingDescription = item.name;
              }
            }
          } else {
            console.warn(`Clothing analysis failed for item ${i + 1}, using fallback description`);
            detailedClothingDescription = item.name;
          }
        } catch (clothingError) {
          console.error(`Error analyzing clothing image ${i + 1}:`, clothingError);
          detailedClothingDescription = item.name;
        }
      } else {
        console.log(`No clothing image available for item ${i + 1}, using text description`);
        detailedClothingDescription = item.name;
      }
      
      allClothingDescriptions.push(detailedClothingDescription);
      allExtractedColors.push(extractedColor);
      allExtractedTextLogos.push(extractedTextLogo);
      allClothingStyleAnalyses.push(clothingStyleAnalysis);
    }
    
    // Combine all clothing descriptions for outfit analysis
    const combinedClothingDescription = allClothingDescriptions.join('. ');
    const combinedColors = allExtractedColors.filter(color => color).join(', ');
    const combinedTextLogos = allExtractedTextLogos.filter(logo => logo && logo !== 'none').join(', ');
    const combinedStyleAnalysis = allClothingStyleAnalyses.join('. ');
    
    // For backward compatibility, keep single item variables
    const detailedClothingDescription = isMultiItem ? combinedClothingDescription : allClothingDescriptions[0];
    const extractedColor = isMultiItem ? combinedColors : allExtractedColors[0];
    const extractedTextLogo = isMultiItem ? combinedTextLogos : allExtractedTextLogos[0];
    const clothingStyleAnalysis = isMultiItem ? combinedStyleAnalysis : allClothingStyleAnalyses[0];

    // 3. PRECISE SIZE ANALYSIS: Compare user measurements with specific requested sizes for each item
    // (Removed manual measurement comparison and preciseFitScore calculation. Relying only on AI fit scores.)

    // Create the analysis result object
    const analysisResult = {
      recommendation: individualScores.map(s => s.recommendation).join(' | '),
      sizeAdvice: individualScores.map(s => s.reason).join(' | '),
      alternativeSize: null, // Not provided by AI
      fitDetails: individualScores.map(s => `${s.itemName}: ${s.reason}`).join(' | '),
      brandComparison: "Size comparison data not available.",
      measurementComparison: '', // Not calculated
      individualScores: individualScores
    };

    console.log('Final analysis result:', analysisResult);

    // 4. DALL-E 3: Generate virtual try-on image for outfit
    console.log('Starting virtual try-on image generation for outfit...');
    
    let clothingImagePrompt = '';
    if (isMultiItem && itemsToAnalyze.length > 1) {
      // Multi-item outfit prompt (user appearance)
      const outfitDescription = itemsToAnalyze.map((item, index) => 
        `${item.name} in size ${item.selectedSize || userData.preferredSize}`
      ).join(' and ');
      clothingImagePrompt = `A realistic, full-body image of ${userAppearanceDescription}, wearing the following clothing items together: ${outfitDescription}. The clothing should match these descriptions: ${combinedClothingDescription}. ${combinedColors ? `The outfit colors include: ${combinedColors}.` : ''} ${combinedTextLogos ? `The outfit includes these details: ${combinedTextLogos}.` : ''} The person should be standing in a neutral pose, clearly displaying all items as they would be worn. Plain white background. No text, no logos, no visible brand names except as described. This is an AI-generated image for a virtual try-on.`;
    } else {
      // Single item prompt (user appearance)
      const singleItem = itemsToAnalyze[0];
      clothingImagePrompt = `A realistic, full-body image of ${userAppearanceDescription}, wearing ${singleItem.name} in size ${singleItem.selectedSize || userData.preferredSize}. The clothing should match this description: ${detailedClothingDescription}. ${extractedColor ? `The most important detail is the color: ${extractedColor}.` : ''} ${extractedTextLogo ? `The clothing must include the following text/logo/number: ${extractedTextLogo}.` : ''} The person should be standing in a neutral pose, clearly displaying the item. Plain white background. No text, no logos, no visible brand names except as described. This is an AI-generated image for a virtual try-on.`;
    }

    // 3. DALL-E 3: Generate virtual try-on image
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
        prompt: clothingImagePrompt,
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
      console.error('DALL-E 3 image generation failed:', imageGenResponse.status, errorText);
      throw new Error(`DALL-E 3 image generation failed: ${imageGenResponse.status} - ${errorText}`);
    }

    // Fallback if no image URL
    if (!overlayImageUrl) {
      overlayImageUrl = 'https://via.placeholder.com/1024x1024?text=Virtual+Try-On+Unavailable';
    }

    // Log the image URL sent to the frontend
    console.log('Image URL sent to frontend:', overlayImageUrl);

    // FINAL SAFETY CHECK: Ensure response payload is bulletproof
    const responsePayload = {
      success: true,
      // Multi-item response structure
      individualScores: individualScores,
      outfitRecommendation: individualScores.map(s => s.recommendation).join(' | '),
      combinedOverlay: overlayImageUrl || 'https://via.placeholder.com/1024x1024?text=Virtual+Try-On+Unavailable',
      // Backward compatibility for single item
      analysis: analysisResult,
      aiMessage: '',
      bodyAnalysis: bodyAssessment || `Height: ${userData.height}in, Weight: ${userData.weight}lbs, Size: ${userData.preferredSize}`,
      overlay: overlayImageUrl || 'https://via.placeholder.com/1024x1024?text=Virtual+Try-On+Unavailable'
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