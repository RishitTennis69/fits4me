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
    const { userPhoto, clothingData, clothingItems, userData, isMultiItem } = await req.json();
    // @ts-ignore Deno types for VSCode/TypeScript
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) throw new Error('OpenAI API key not configured');

    console.log('Analyzing fit for user:', userData);
    console.log('Multi-item mode:', isMultiItem);
    console.log('Clothing items:', clothingItems);

    // Handle both single item and multi-item modes
    const itemsToAnalyze = isMultiItem ? clothingItems : [clothingData];
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
    console.log('=== PRECISE SIZE ANALYSIS ===');
    console.log('User data:', userData);
    console.log('Items to analyze:', itemsToAnalyze);
    
    let individualScores: any[] = [];
    let overallFitScore = 0;
    let overallMeasurementComparison = '';
    let overallFitDetails = '';
    let overallSizeAdvice = '';
    let overallRecommendation = '';
    
    // Analyze each item individually
    for (let i = 0; i < itemsToAnalyze.length; i++) {
      const item = itemsToAnalyze[i];
      const selectedSize = item.selectedSize || userData.preferredSize;
      console.log(`Analyzing item ${i + 1}: ${item.name} in size ${selectedSize}`);
      
      // Get the specific size dimensions for the requested size
      const requestedSizeDimensions = item.sizeChart?.[selectedSize];
      console.log(`Size dimensions for ${selectedSize}:`, requestedSizeDimensions);
      
      // Calculate precise fit score based on actual measurements
      let preciseFitScore = 50; // Base score
      let measurementComparison = '';
      let fitDetails = '';
      let sizeAdvice = '';
      let alternativeSize = null;
      let recommendation = '';
      
      if (requestedSizeDimensions && detailedMeasurements?.measurements) {
        console.log(`=== MEASUREMENT COMPARISON FOR ITEM ${i + 1} ===`);
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
        console.log(`Average measurement difference for item ${i + 1}:`, averageDifference);
        
        // Adjust score based on average difference
        if (averageDifference <= 1) preciseFitScore += 20;
        else if (averageDifference <= 2) preciseFitScore += 10;
        else if (averageDifference <= 3) preciseFitScore += 5;
        else preciseFitScore -= 15;
        
        // Create detailed comparison text
        measurementComparison = `Measurement Analysis: ${comparisonDetails.join('; ')}. Average difference: ${averageDifference.toFixed(1)} inches.`;
        
        // Determine fit details based on measurements
        if (averageDifference <= 1) {
          fitDetails = `This size ${selectedSize} should fit you very well. The measurements align closely with your body proportions.`;
          sizeAdvice = `Size ${selectedSize} is recommended for your measurements.`;
          recommendation = `Excellent fit! Size ${selectedSize} matches your measurements very well.`;
        } else if (averageDifference <= 2) {
          fitDetails = `Size ${selectedSize} should fit reasonably well with minor adjustments.`;
          sizeAdvice = `Size ${selectedSize} should work, but consider trying one size ${averageDifference > 1.5 ? 'smaller' : 'larger'} if available.`;
          recommendation = `Good fit potential. Size ${selectedSize} should work well for your body type.`;
        } else if (averageDifference <= 3) {
          fitDetails = `Size ${selectedSize} may be ${averageDifference > 2.5 ? 'too large' : 'too small'} for your measurements.`;
          sizeAdvice = `Consider trying a different size. Size ${selectedSize} may not be optimal.`;
          recommendation = `Moderate fit. Size ${selectedSize} might not be the best choice for your measurements.`;
          // Suggest alternative size
          if (item.sizes && item.sizes.length > 1) {
            const currentIndex = item.sizes.indexOf(selectedSize);
            if (currentIndex > 0 && averageDifference > 2.5) {
              alternativeSize = item.sizes[currentIndex - 1]; // Try smaller
            } else if (currentIndex < item.sizes.length - 1 && averageDifference <= 2.5) {
              alternativeSize = item.sizes[currentIndex + 1]; // Try larger
            }
          }
        } else {
          fitDetails = `Size ${selectedSize} is significantly ${averageDifference > 3.5 ? 'too large' : 'too small'} for your measurements.`;
          sizeAdvice = `This size is not recommended for your body type. Consider a different size or item.`;
          recommendation = `Poor fit. Size ${selectedSize} is not suitable for your measurements.`;
          preciseFitScore = Math.max(0, preciseFitScore - 30); // Heavy penalty for poor fit
        }
        
      } else {
        console.log(`No size chart data available for item ${i + 1}, using fallback analysis`);
        measurementComparison = "Size chart data not available for precise measurement comparison.";
        fitDetails = `Based on your body type and the available sizes, this item should work well for your proportions.`;
        sizeAdvice = `Size ${selectedSize} appears suitable for your body type.`;
        recommendation = `Size ${selectedSize} should be a good fit based on your body proportions.`;
        preciseFitScore = 50; // Neutral score when no data
      }
      
      // Clamp score to 0-100
      preciseFitScore = Math.max(0, Math.min(100, Math.round(preciseFitScore)));
      
      // Add to individual scores
      individualScores.push({
        itemId: item.id,
        itemName: item.name,
        selectedSize: selectedSize,
        fitScore: preciseFitScore,
        recommendation: recommendation,
        sizeAdvice: sizeAdvice,
        alternativeSize: alternativeSize,
        fitDetails: fitDetails,
        measurementComparison: measurementComparison
      });
      
      // Add to overall score
      overallFitScore += preciseFitScore;
    }
    
    // Calculate average overall fit score
    overallFitScore = Math.round(overallFitScore / itemsToAnalyze.length);
    
    // Create overall analysis summary
    if (isMultiItem && itemsToAnalyze.length > 1) {
      const bestItem = individualScores.reduce((best, current) => 
        current.fitScore > best.fitScore ? current : best
      );
      const worstItem = individualScores.reduce((worst, current) => 
        current.fitScore < worst.fitScore ? current : worst
      );
      
      overallMeasurementComparison = `Overall analysis of ${itemsToAnalyze.length} items. Best fit: ${bestItem.itemName} (${bestItem.fitScore}%), Worst fit: ${worstItem.itemName} (${worstItem.fitScore}%).`;
      
      if (overallFitScore >= 80) {
        overallFitDetails = `Excellent outfit combination! All items work well together and should fit you very well.`;
        overallSizeAdvice = `Your size selections are optimal. Consider this a complete outfit.`;
        overallRecommendation = `Perfect outfit! All items complement each other and should fit excellently.`;
      } else if (overallFitScore >= 70) {
        overallFitDetails = `Good outfit combination. Most items should fit well with minor adjustments.`;
        overallSizeAdvice = `Most sizes are good, but consider adjusting ${worstItem.itemName} to size ${worstItem.alternativeSize || 'a different size'}.`;
        overallRecommendation = `Great outfit! Most items will fit well, with room for minor improvements.`;
      } else if (overallFitScore >= 60) {
        overallFitDetails = `Moderate outfit combination. Some items may need size adjustments.`;
        overallSizeAdvice = `Consider trying different sizes for ${worstItem.itemName} and potentially other items.`;
        overallRecommendation = `Decent outfit potential. Some items may need size changes for optimal fit.`;
      } else {
        overallFitDetails = `Poor outfit combination. Multiple items may not fit well.`;
        overallSizeAdvice = `Consider different sizes or alternative items for better fit.`;
        overallRecommendation = `This outfit may not work well. Consider different items or sizes.`;
      }
    } else {
      // Single item mode - use the individual analysis
      const singleItem = individualScores[0];
      overallFitScore = singleItem.fitScore;
      overallMeasurementComparison = singleItem.measurementComparison;
      overallFitDetails = singleItem.fitDetails;
      overallSizeAdvice = singleItem.sizeAdvice;
      overallRecommendation = singleItem.recommendation;
    }
    
    console.log('=== FIT ANALYSIS RESULTS ===');
    console.log('Overall fit score:', overallFitScore);
    console.log('Individual scores:', individualScores);
    console.log('Overall measurement comparison:', overallMeasurementComparison);
    console.log('Overall fit details:', overallFitDetails);
    console.log('Overall size advice:', overallSizeAdvice);
    console.log('Overall recommendation:', overallRecommendation);

    // Create the analysis result object
    const analysisResult = {
      fitScore: overallFitScore,
      recommendation: overallRecommendation,
      sizeAdvice: overallSizeAdvice,
      alternativeSize: null, // Will be handled per item
      fitDetails: overallFitDetails,
      brandComparison: "Size comparison data not available.",
      measurementComparison: overallMeasurementComparison
    };

    console.log('Final analysis result:', analysisResult);

    // === NEW: Extract user appearance features from photo ===
    let userAppearance = {
      skinTone: '',
      hairColor: '',
      hairStyle: '',
      genderPresentation: '',
      ageGroup: '',
      distinguishingFeatures: ''
    };
    try {
      const appearanceResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
                  text: `Analyze this photo and provide the following user appearance details in valid JSON:\n{\n  "skinTone": "e.g. light, medium, dark, olive, etc.",\n  "hairColor": "e.g. black, brown, blonde, red, gray, etc.",\n  "hairStyle": "e.g. short, long, curly, straight, etc.",\n  "genderPresentation": "e.g. male, female, non-binary, etc.",\n  "ageGroup": "e.g. child, teen, young adult, adult, senior",\n  "distinguishingFeatures": "e.g. glasses, beard, freckles, etc."\n}\nRespond with ONLY valid JSON. No extra text, no markdown, no explanations, no code blocks.`
                },
                imageContent
              ]
            }
          ]
        }),
      });
      if (appearanceResponse.ok) {
        const appearanceData = await appearanceResponse.json();
        const appearanceContent = appearanceData.choices?.[0]?.message?.content;
        if (appearanceContent) {
          try {
            let jsonBlock = appearanceContent.trim();
            if (jsonBlock.startsWith('{') && jsonBlock.endsWith('}')) {
              userAppearance = JSON.parse(jsonBlock);
            } else {
              const match = jsonBlock.match(/\{[\s\S]*\}/);
              if (match) {
                userAppearance = JSON.parse(match[0]);
              }
            }
            console.log('Extracted user appearance:', userAppearance);
          } catch (e) {
            console.error('Failed to parse appearance JSON:', e);
          }
        }
      } else {
        const errorText = await appearanceResponse.text();
        console.warn('OpenAI appearance extraction failed:', errorText);
      }
    } catch (appearanceError) {
      console.error('Error extracting user appearance:', appearanceError);
    }

    // 4. DALL-E 3: Generate virtual try-on image for outfit
    console.log('Starting virtual try-on image generation for outfit...');
    
    let clothingImagePrompt = '';
    let appearanceDetails = '';
    if (userAppearance) {
      appearanceDetails = `${userAppearance.genderPresentation ? `A ${userAppearance.genderPresentation}` : 'A person'}${userAppearance.ageGroup ? `, ${userAppearance.ageGroup}` : ''}${userAppearance.skinTone ? `, with ${userAppearance.skinTone} skin` : ''}${userAppearance.hairColor ? `, ${userAppearance.hairColor} hair` : ''}${userAppearance.hairStyle ? `, ${userAppearance.hairStyle} hair style` : ''}${userAppearance.distinguishingFeatures ? `, ${userAppearance.distinguishingFeatures}` : ''}`;
    }
    
    if (isMultiItem && itemsToAnalyze.length > 1) {
      // Multi-item outfit prompt
      const outfitDescription = itemsToAnalyze.map((item, index) => 
        `${item.name} in size ${item.selectedSize || userData.preferredSize}`
      ).join(' with ');
      
      clothingImagePrompt = `A photorealistic image of ${appearanceDetails} wearing a complete outfit: ${outfitDescription}. The outfit should match these descriptions: ${combinedClothingDescription}. ${combinedColors ? `The outfit colors include: ${combinedColors}.` : ''} ${combinedTextLogos ? `The outfit includes these details: ${combinedTextLogos}.` : ''} The fit should be realistic for the given sizes and body proportions. The person should have a natural, confident pose. Neutral background. No text, no logos, no visible brand names except as described. This is an AI-generated image showing a complete outfit combination.`;
    } else {
      // Single item prompt (backward compatibility)
      const singleItem = itemsToAnalyze[0];
      if (singleItem.images && singleItem.images.length > 0) {
        clothingImagePrompt = `A photorealistic image of ${appearanceDetails}. The person is wearing ${singleItem.name} in size ${singleItem.selectedSize || userData.preferredSize}. The clothing should match this description: ${detailedClothingDescription}. ${extractedColor ? `The most important detail is the color: ${extractedColor}.` : ''} ${extractedTextLogo ? `The clothing must include the following text/logo/number: ${extractedTextLogo}.` : ''} The fit should be realistic for the given size and body proportions. The clothing should look as close as possible to the product image: ${singleItem.images[0]}. The person should have a natural, confident pose. Neutral background. No text, no logos, no visible brand names except as described. This is an AI-generated image, not a mannequin.`;
      } else {
        clothingImagePrompt = `A photorealistic image of ${appearanceDetails}. The person is wearing ${singleItem.name} in size ${singleItem.selectedSize || userData.preferredSize}. The clothing should match this description: ${detailedClothingDescription}. The fit should be realistic for the given size and body proportions. The person should have a natural, confident pose. Neutral background. No text, no logos, no visible brand names except as described. This is an AI-generated image, not a mannequin.`;
      }
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
      overallFitScore: overallFitScore,
      individualScores: individualScores,
      outfitRecommendation: overallRecommendation,
      outfitCompatibility: {
        colorHarmony: Math.floor(Math.random() * 30) + 70, // Placeholder for now
        styleCohesion: Math.floor(Math.random() * 30) + 70, // Placeholder for now
        overallRating: overallFitScore >= 80 ? 'Excellent' : overallFitScore >= 70 ? 'Good' : overallFitScore >= 60 ? 'Moderate' : 'Poor'
      },
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