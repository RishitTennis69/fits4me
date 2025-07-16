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
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) throw new Error('OpenAI API key not configured');

    console.log('Analyzing fit for user:', userData);

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
                text: `This image is of an adult (over 18) and is provided with full consent by the user for the purpose of virtual clothing fitting. 

Please analyze the body proportions and estimate precise measurements for clothing fit.

IMPORTANT: Respond with ONLY valid JSON. No extra text, no markdown, no explanations, no code blocks.

CRITICAL: You must estimate the person's height from the image. Look at their proportions, compare to objects in the background, or use visual cues to estimate their actual height in inches. Do NOT assume a default height.

Analyze the body and provide:
1. Body type assessment
2. Precise measurements in inches (including estimated height from image)
3. Fit recommendations

Respond in this exact JSON format:
{
  "bodyType": "slim|average|full",
  "bodyShape": "rectangular|triangle|inverted-triangle|hourglass",
  "estimatedHeight": number,
  "estimatedWeight": number,
  "measurements": {
    "chest": number,
    "waist": number,
    "hips": number,
    "shoulders": number,
    "armLength": number,
    "inseam": number
  },
  "fitNotes": "string describing body proportions and fit considerations"
}`
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
        // Try to parse the JSON response
        let jsonBlock = bodyContent.trim();
        if (jsonBlock.startsWith('{') && jsonBlock.endsWith('}')) {
          try {
            detailedMeasurements = JSON.parse(jsonBlock);
            console.log('Successfully parsed detailed measurements:', detailedMeasurements);
          } catch (e) {
            console.error('Direct JSON parse failed, will try regex extraction.', e);
          }
        }
        
        // If not parsed yet, try to extract JSON block with regex
        if (!detailedMeasurements) {
          const match = jsonBlock.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              detailedMeasurements = JSON.parse(match[0]);
              console.log('Parsed detailed measurements from regex-extracted block.');
            } catch (e) {
              console.error('Regex JSON parse failed.', e);
            }
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

    // 2. AI Clothing Analysis: Analyze the clothing item in detail for virtual try-on
    let detailedClothingDescription = clothingData.description;
    let extractedTextLogo = '';
    let extractedColor = '';
    let clothingStyleAnalysis = '';
    
    if (clothingData.images && clothingData.images.length > 0) {
      try {
        console.log('Analyzing clothing image for detailed description...');
        
        const clothingImageContent = {
          type: 'image_url',
          image_url: {
            url: clothingData.images[0]
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
              console.log('Clothing analysis result:', analysis);
              
              extractedColor = analysis.primaryColor || clothingData.color || '';
              extractedTextLogo = analysis.textLogoNumber || '';
              detailedClothingDescription = analysis.detailedDescription || clothingData.description;
              clothingStyleAnalysis = `Style: ${analysis.styleCharacteristics}. Features: ${analysis.uniqueFeatures}. Aesthetic: ${analysis.aesthetic}. Material: ${analysis.materialDetails}`;
              
              console.log('Enhanced clothing description:', {
                color: extractedColor,
                textLogo: extractedTextLogo,
                description: detailedClothingDescription,
                styleAnalysis: clothingStyleAnalysis
              });
            } catch (parseError) {
              console.error('Failed to parse clothing analysis JSON:', parseError);
              detailedClothingDescription = clothingData.description;
            }
          }
        } else {
          console.warn('Clothing analysis failed, using fallback description');
          detailedClothingDescription = clothingData.description;
        }
      } catch (clothingError) {
        console.error('Error analyzing clothing image:', clothingError);
        detailedClothingDescription = clothingData.description;
      }
    } else {
      console.log('No clothing image available for analysis, using text description');
      detailedClothingDescription = clothingData.description;
    }

    // 3. PRECISE SIZE ANALYSIS: Compare user measurements with specific requested size
    console.log('=== PRECISE SIZE ANALYSIS ===');
    console.log('User data:', userData);
    console.log('Clothing data:', clothingData);
    console.log('Size chart:', clothingData.sizeChart);
    console.log('Requested size:', userData.preferredSize);
    
    // Get the specific size dimensions for the requested size
    const requestedSizeDimensions = clothingData.sizeChart?.[userData.preferredSize];
    console.log('Requested size dimensions:', requestedSizeDimensions);
    
    // Calculate precise fit score based on actual measurements
    let preciseFitScore = 50; // Base score
    let measurementComparison = '';
    let fitDetails = '';
    let sizeAdvice = '';
    let alternativeSize = null;
    let recommendation = '';
    
    if (requestedSizeDimensions && detailedMeasurements?.measurements) {
      console.log('=== MEASUREMENT COMPARISON ===');
      const userMeasurements = detailedMeasurements.measurements;
      const sizeMeasurements = requestedSizeDimensions;
      
      let totalDifference = 0;
      let measurementCount = 0;
      let comparisonDetails: string[] = [];
      
      // Compare each measurement
      if (sizeMeasurements.chest && userMeasurements.chest) {
        const chestDiff = Math.abs(parseFloat(sizeMeasurements.chest) - userMeasurements.chest);
        totalDifference += chestDiff;
        measurementCount++;
        comparisonDetails.push(`Chest: User ${userMeasurements.chest}" vs Size ${sizeMeasurements.chest}" (diff: ${chestDiff.toFixed(1)}")`);
        
        if (chestDiff <= 1) preciseFitScore += 15;
        else if (chestDiff <= 2) preciseFitScore += 10;
        else if (chestDiff <= 3) preciseFitScore += 5;
        else preciseFitScore -= 10;
      }
      
      if (sizeMeasurements.waist && userMeasurements.waist) {
        const waistDiff = Math.abs(parseFloat(sizeMeasurements.waist) - userMeasurements.waist);
        totalDifference += waistDiff;
        measurementCount++;
        comparisonDetails.push(`Waist: User ${userMeasurements.waist}" vs Size ${sizeMeasurements.waist}" (diff: ${waistDiff.toFixed(1)}")`);
        
        if (waistDiff <= 1) preciseFitScore += 15;
        else if (waistDiff <= 2) preciseFitScore += 10;
        else if (waistDiff <= 3) preciseFitScore += 5;
        else preciseFitScore -= 10;
      }
      
      if (sizeMeasurements.hips && userMeasurements.hips) {
        const hipsDiff = Math.abs(parseFloat(sizeMeasurements.hips) - userMeasurements.hips);
        totalDifference += hipsDiff;
        measurementCount++;
        comparisonDetails.push(`Hips: User ${userMeasurements.hips}" vs Size ${sizeMeasurements.hips}" (diff: ${hipsDiff.toFixed(1)}")`);
        
        if (hipsDiff <= 1) preciseFitScore += 10;
        else if (hipsDiff <= 2) preciseFitScore += 7;
        else if (hipsDiff <= 3) preciseFitScore += 3;
        else preciseFitScore -= 8;
      }
      
      if (sizeMeasurements.shoulders && userMeasurements.shoulders) {
        const shouldersDiff = Math.abs(parseFloat(sizeMeasurements.shoulders) - userMeasurements.shoulders);
        totalDifference += shouldersDiff;
        measurementCount++;
        comparisonDetails.push(`Shoulders: User ${userMeasurements.shoulders}" vs Size ${sizeMeasurements.shoulders}" (diff: ${shouldersDiff.toFixed(1)}")`);
        
        if (shouldersDiff <= 0.5) preciseFitScore += 10;
        else if (shouldersDiff <= 1) preciseFitScore += 7;
        else if (shouldersDiff <= 1.5) preciseFitScore += 3;
        else preciseFitScore -= 8;
      }
      
      // Calculate average difference
      const averageDifference = measurementCount > 0 ? totalDifference / measurementCount : 0;
      console.log('Average measurement difference:', averageDifference);
      console.log('Measurement comparison details:', comparisonDetails);
      
      // Adjust score based on average difference
      if (averageDifference <= 1) preciseFitScore += 20;
      else if (averageDifference <= 2) preciseFitScore += 10;
      else if (averageDifference <= 3) preciseFitScore += 5;
      else preciseFitScore -= 15;
      
      // Create detailed comparison text
      measurementComparison = `Measurement Analysis: ${comparisonDetails.join('; ')}. Average difference: ${averageDifference.toFixed(1)} inches.`;
      
      // Determine fit details based on measurements
      if (averageDifference <= 1) {
        fitDetails = `This size ${userData.preferredSize} should fit you very well. The measurements align closely with your body proportions.`;
        sizeAdvice = `Size ${userData.preferredSize} is recommended for your measurements.`;
        recommendation = `Excellent fit! Size ${userData.preferredSize} matches your measurements very well.`;
      } else if (averageDifference <= 2) {
        fitDetails = `Size ${userData.preferredSize} should fit reasonably well with minor adjustments.`;
        sizeAdvice = `Size ${userData.preferredSize} should work, but consider trying one size ${averageDifference > 1.5 ? 'smaller' : 'larger'} if available.`;
        recommendation = `Good fit potential. Size ${userData.preferredSize} should work well for your body type.`;
      } else if (averageDifference <= 3) {
        fitDetails = `Size ${userData.preferredSize} may be ${averageDifference > 2.5 ? 'too large' : 'too small'} for your measurements.`;
        sizeAdvice = `Consider trying a different size. Size ${userData.preferredSize} may not be optimal.`;
        recommendation = `Moderate fit. Size ${userData.preferredSize} might not be the best choice for your measurements.`;
        // Suggest alternative size
        if (clothingData.sizes && clothingData.sizes.length > 1) {
          const currentIndex = clothingData.sizes.indexOf(userData.preferredSize);
          if (currentIndex > 0 && averageDifference > 2.5) {
            alternativeSize = clothingData.sizes[currentIndex - 1]; // Try smaller
          } else if (currentIndex < clothingData.sizes.length - 1 && averageDifference <= 2.5) {
            alternativeSize = clothingData.sizes[currentIndex + 1]; // Try larger
          }
        }
      } else {
        fitDetails = `Size ${userData.preferredSize} is significantly ${averageDifference > 3.5 ? 'too large' : 'too small'} for your measurements.`;
        sizeAdvice = `This size is not recommended for your body type. Consider a different size or item.`;
        recommendation = `Poor fit. Size ${userData.preferredSize} is not suitable for your measurements.`;
        preciseFitScore = Math.max(0, preciseFitScore - 30); // Heavy penalty for poor fit
      }
      
    } else {
      console.log('No size chart data available, using fallback analysis');
      measurementComparison = "Size chart data not available for precise measurement comparison.";
      fitDetails = `Unable to provide precise fit analysis due to missing size chart data. Based on your body type and the available sizes, we recommend trying on the item in person or checking customer reviews for fit feedback.`;
      sizeAdvice = `Consider trying on the item in person or checking customer reviews for fit feedback.`;
      recommendation = `Size ${userData.preferredSize} may work, but we recommend trying on the item in person for the best fit assessment.`;
      preciseFitScore = 50; // Neutral score when no data
    }
    
    // Clamp score to 0-100
    preciseFitScore = Math.max(0, Math.min(100, Math.round(preciseFitScore)));
    
    console.log('=== FIT ANALYSIS RESULTS ===');
    console.log('Precise fit score:', preciseFitScore);
    console.log('Measurement comparison:', measurementComparison);
    console.log('Fit details:', fitDetails);
    console.log('Size advice:', sizeAdvice);
    console.log('Alternative size:', alternativeSize);
    console.log('Recommendation:', recommendation);

    // Create the analysis result object
    const analysisResult = {
      fitScore: preciseFitScore,
      recommendation: recommendation,
      sizeAdvice: sizeAdvice,
      alternativeSize: alternativeSize,
      fitDetails: fitDetails,
      brandComparison: "Size comparison data not available.",
      measurementComparison: measurementComparison
    };

    console.log('Final analysis result:', analysisResult);

    // 0. Real Person Overlay: Generate a photorealistic image of a real person with user's proportions
    let clothingImagePrompt = '';
    if (clothingData.images && clothingData.images.length > 0) {
      clothingImagePrompt = `A photorealistic image of a real person with the following body proportions: height: ${userData.height} inches, weight: ${userData.weight} lbs, chest: ${detailedMeasurements?.measurements?.chest || '?'}", waist: ${detailedMeasurements?.measurements?.waist || '?'}", hips: ${detailedMeasurements?.measurements?.hips || '?'}", shoulders: ${detailedMeasurements?.measurements?.shoulders || '?'}". The person is wearing ${clothingData.name} in size ${userData.preferredSize}. The clothing should match this description: ${detailedClothingDescription}. ${extractedColor ? `The most important detail is the color: ${extractedColor}.` : ''} ${extractedTextLogo ? `The clothing must include the following text/logo/number: ${extractedTextLogo}.` : ''} The fit should be realistic for the given size and body. The clothing should look as close as possible to the product image: ${clothingData.images[0]}. Neutral background. No text, no logos, no visible brand names except as described. This is an AI-generated image, not a mannequin.`;
    } else {
      console.warn('No product image available for overlay. Using fallback prompt.');
      clothingImagePrompt = `A photorealistic image of a real person with the following body proportions: height: ${userData.height} inches, weight: ${userData.weight} lbs, chest: ${detailedMeasurements?.measurements?.chest || '?'}", waist: ${detailedMeasurements?.measurements?.waist || '?'}", hips: ${detailedMeasurements?.measurements?.hips || '?'}", shoulders: ${detailedMeasurements?.measurements?.shoulders || '?'}". The person is wearing ${clothingData.name} in size ${userData.preferredSize}. The clothing should match this description: ${detailedClothingDescription}. The fit should be realistic for the given size and body. Neutral background. No text, no logos, no visible brand names except as described. This is an AI-generated image, not a mannequin.`;
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
      analysis: {
        fitScore: preciseFitScore,
        recommendation: recommendation,
        sizeAdvice: sizeAdvice,
        alternativeSize: alternativeSize,
        fitDetails: fitDetails,
        brandComparison: "Size comparison data not available.",
        measurementComparison: measurementComparison
      },
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