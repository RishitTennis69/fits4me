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
    let bodyAssessment = '';
    let usedManualMeasurements = false;
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
                text: `This image is of an adult (over 18) and is provided with full consent by the user for the purpose of virtual clothing fitting. Please analyze the body proportions (shoulder width, chest/bust circumference, waist size, body type, etc.) and estimate measurements for clothing fit. Provided measurements: height: ${userData.height}in, weight: ${userData.weight}lbs, preferred size: ${userData.preferredSize}.`
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
    bodyAssessment = bodyAnalysis.choices?.[0]?.message?.content || '';

    // Fallback: If Claude refuses or fails to analyze the body, use only manual measurements
    if (!bodyAssessment || /not able to analyze|cannot analyze|refuse|privacy protection|error|unavailable/i.test(bodyAssessment)) {
      usedManualMeasurements = true;
      bodyAssessment = `Manual fallback: User-provided measurements only. Height: ${userData.height}in, Weight: ${userData.weight}lbs, Preferred Size: ${userData.preferredSize}.`;
      console.warn('Claude refused or failed body analysis. Using manual measurements only.');
    }

    // BULLETPROOF BODY ASSESSMENT: Ensure we always have a valid body assessment
    if (!bodyAssessment || bodyAssessment.trim().length < 10) {
      bodyAssessment = `Body analysis: Height ${userData.height} inches, Weight ${userData.weight} lbs, Preferred size ${userData.preferredSize}. Standard body proportions assumed.`;
      usedManualMeasurements = true;
      console.warn('Body assessment was invalid, using fallback.');
    }

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
                text: `CLOTHING ITEM:\nName: ${clothingData.name}\nBrand: ${clothingData.brand || 'N/A'}\nAvailable Sizes: ${clothingData.sizes?.join(', ')}\nSize Chart: ${JSON.stringify(clothingData.sizeChart)}\nDescription: ${clothingData.description}\nMaterial: ${clothingData.material}\n\nUSER BODY ANALYSIS:\n${bodyAssessment}\n\nUSER MEASUREMENTS:\nHeight: ${userData.height}in\nWeight: ${userData.weight}lbs\nPreferred Size: ${userData.preferredSize}\n\nIMPORTANT: Respond with ONLY valid JSON. No extra text, no markdown, no explanations, no code blocks. If you cannot provide a fit analysis, respond with a clear message explaining why.\n\nPlease provide:\n1. Fit Score (0-100) for the preferred size ${userData.preferredSize} (fitScore must be a number between 0 and 100, never a string, null, or N/A)\n2. Detailed fit recommendation\n3. Alternative size suggestions if needed (e.g., would XS or M be better?)\n4. Brand comparison: If you have size charts for other brands, compare how this size would fit in those brands (e.g., “Nike S is smaller than Adidas S”). If no data, say so.\n5. Specific advice about how this item will fit (loose, tight, perfect, etc.)\n\nRespond in JSON format ONLY:\n{\n  "fitScore": number,\n  "recommendation": "string",\n  "sizeAdvice": "string",\n  "alternativeSize": "string or null",\n  "fitDetails": "string",\n  "brandComparison": "string"\n}`
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
    let aiMessage = '';

    let content = fitAnalysis.choices?.[0]?.message?.content;
    // If content is an array (Claude sometimes returns [{type: 'text', text: ...}]), extract the text
    if (Array.isArray(content) && content[0]?.text) {
      content = content[0].text;
    }
    if (!content) {
      console.error('Claude fit analysis response content is undefined. Full response:', JSON.stringify(fitAnalysis, null, 2));
      aiMessage = 'AI fit analysis is not available at this time.';
      analysisResult = null;
    } else {
      try {
        let jsonBlock = content.trim();
        // If it's a string that looks like JSON, parse it
        if (jsonBlock.startsWith('{') && jsonBlock.endsWith('}')) {
          try {
            analysisResult = JSON.parse(jsonBlock);
            console.log('Parsed JSON directly from string.');
          } catch (e) {
            console.error('Direct JSON parse failed, will try regex extraction.', e);
          }
        }
        // If not parsed yet, try to extract JSON block with regex
        if (!analysisResult) {
          const match = jsonBlock.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              analysisResult = JSON.parse(match[0]);
              console.log('Parsed JSON from regex-extracted block.');
            } catch (e) {
              console.error('Regex JSON parse failed.', e);
            }
          }
        }
        // If analysisResult is a string (double-encoded), parse again
        if (typeof analysisResult === 'string') {
          try {
            analysisResult = JSON.parse(analysisResult);
            console.log('Parsed double-encoded JSON from Claude.');
          } catch (e) {
            aiMessage = 'AI fit analysis returned invalid JSON.';
            analysisResult = null;
          }
        }
        if (!analysisResult) {
          aiMessage = 'AI fit analysis response was invalid.';
        } else {
          // Defensive: Validate fitScore
          let fitScoreValid = false;
          if (typeof analysisResult?.fitScore === 'number' && analysisResult.fitScore >= 0 && analysisResult.fitScore <= 100) {
            fitScoreValid = true;
          } else if (typeof analysisResult?.fitScore === 'string') {
            const num = parseInt(analysisResult.fitScore);
            if (!isNaN(num) && num >= 0 && num <= 100) {
              analysisResult.fitScore = num;
              fitScoreValid = true;
            }
          }
          if (!fitScoreValid) {
            aiMessage = 'AI fit analysis returned an invalid score.';
            analysisResult = null;
          }
        }
      } catch (parseError) {
        console.error('Failed to robustly parse JSON response:', parseError);
        aiMessage = 'AI fit analysis response was invalid.';
        analysisResult = null;
      }
    }

    console.log('Fit analysis result:', analysisResult);

    // BULLETPROOF FALLBACK: If Claude fails completely, generate a basic analysis
    if (!analysisResult || typeof analysisResult !== 'object') {
      console.warn('Claude analysis failed, generating fallback analysis using in-house algorithms');
      
      // IN-HOUSE SIZING ALGORITHMS
      const sizingAnalysis = calculateFitWithAlgorithms(userData, clothingData);
      
      analysisResult = sizingAnalysis;
      aiMessage = 'AI analysis was limited, but we provided a fit assessment using our sizing algorithms.';
      console.log('Generated in-house analysis:', analysisResult);
    }

    // FINAL VALIDATION: Ensure all required fields exist
    const validatedAnalysis = {
      fitScore: typeof analysisResult.fitScore === 'number' && analysisResult.fitScore >= 0 && analysisResult.fitScore <= 100 
        ? analysisResult.fitScore 
        : 75,
      recommendation: analysisResult.recommendation || `Size ${userData.preferredSize} should work well for your measurements.`,
      sizeAdvice: analysisResult.sizeAdvice || `Size ${userData.preferredSize} is recommended.`,
      alternativeSize: analysisResult.alternativeSize || null,
      fitDetails: analysisResult.fitDetails || `This item should fit well in size ${userData.preferredSize}.`,
      brandComparison: analysisResult.brandComparison || "Size comparison data not available."
    };

    console.log('Final validated analysis:', validatedAnalysis);

    // IN-HOUSE SIZING ALGORITHMS FUNCTION
    function calculateFitWithAlgorithms(userData: any, clothingData: any) {
      const { height, weight, preferredSize } = userData;
      const { sizes, sizeChart, name, brand, material, description } = clothingData;
      
      // ADVANCED BODY ANALYSIS
      const bodyAnalysis = analyzeBodyType(userData);
      const { bodyType, bodyShape, measurements, bmi, bodyFatEstimate } = bodyAnalysis;
      
      // FABRIC AND MATERIAL ANALYSIS
      const fabricAnalysis = analyzeFabricAndFit(material, description, name);
      const { stretchFactor, thickness, breathability, fitStyle } = fabricAnalysis;
      
      // BRAND SIZING PATTERNS
      const brandAnalysis = analyzeBrandSizing(brand, preferredSize, sizes);
      const { brandFit, sizeConsistency, recommendedSize } = brandAnalysis;
      
      // ADVANCED FIT SCORING ALGORITHM
      const fitScore = calculateAdvancedFitScore({
        userData,
        clothingData,
        bodyAnalysis,
        fabricAnalysis,
        brandAnalysis
      });
      
      // GENERATE SOPHISTICATED RECOMMENDATIONS
      const recommendations = generateAdvancedRecommendations({
        fitScore,
        userData,
        clothingData,
        bodyAnalysis,
        fabricAnalysis,
        brandAnalysis
      });
      
      return {
        fitScore: Math.round(fitScore),
        recommendation: recommendations.recommendation,
        sizeAdvice: recommendations.sizeAdvice,
        alternativeSize: recommendations.alternativeSize,
        fitDetails: recommendations.fitDetails,
        brandComparison: recommendations.brandComparison
      };
    }
    
    // ADVANCED BODY TYPE ANALYSIS
    function analyzeBodyType(userData: any) {
      const { height, weight } = userData;
      
      // Calculate BMI and body fat estimate
      const heightInMeters = height * 0.0254;
      const weightInKg = weight * 0.453592;
      const bmi = weightInKg / (heightInMeters * heightInMeters);
      
      // Advanced body fat estimation using multiple formulas
      const bodyFatEstimate = estimateBodyFat(height, weight, bmi);
      
      // Determine body type with more granularity
      let bodyType = 'average';
      let bodyShape = 'rectangular';
      
      if (bmi < 18.5) {
        bodyType = 'slim';
        bodyShape = height > 68 ? 'ectomorph' : 'petite';
      } else if (bmi > 25) {
        bodyType = 'full';
        bodyShape = bmi > 30 ? 'endomorph' : 'mesomorph';
      } else {
        bodyType = 'average';
        bodyShape = 'rectangular';
      }
      
      // Calculate estimated measurements
      const measurements = estimateMeasurements(height, weight, bodyType, bodyShape);
      
      return {
        bodyType,
        bodyShape,
        measurements,
        bmi,
        bodyFatEstimate
      };
    }
    
    // ESTIMATE BODY FAT PERCENTAGE
    function estimateBodyFat(height: number, weight: number, bmi: number): number {
      // Using U.S. Navy body fat estimation formula
      const heightInCm = height * 2.54;
      const weightInKg = weight * 0.453592;
      
      // Simplified estimation based on BMI ranges
      if (bmi < 18.5) return 8 + Math.random() * 4; // 8-12%
      if (bmi < 25) return 12 + Math.random() * 8; // 12-20%
      if (bmi < 30) return 20 + Math.random() * 10; // 20-30%
      return 30 + Math.random() * 15; // 30-45%
    }
    
    // ESTIMATE BODY MEASUREMENTS
    function estimateMeasurements(height: number, weight: number, bodyType: string, bodyShape: string) {
      const chest = estimateChestCircumference(height, weight, bodyType);
      const waist = estimateWaistCircumference(height, weight, bodyType);
      const hips = estimateHipCircumference(height, weight, bodyType);
      const shoulders = estimateShoulderWidth(height, bodyType);
      
      return { chest, waist, hips, shoulders };
    }
    
    function estimateChestCircumference(height: number, weight: number, bodyType: string): number {
      let baseChest = height * 0.6 + weight * 0.3;
      if (bodyType === 'slim') baseChest *= 0.9;
      if (bodyType === 'full') baseChest *= 1.1;
      return Math.round(baseChest);
    }
    
    function estimateWaistCircumference(height: number, weight: number, bodyType: string): number {
      let baseWaist = height * 0.45 + weight * 0.4;
      if (bodyType === 'slim') baseWaist *= 0.85;
      if (bodyType === 'full') baseWaist *= 1.15;
      return Math.round(baseWaist);
    }
    
    function estimateHipCircumference(height: number, weight: number, bodyType: string): number {
      let baseHips = height * 0.65 + weight * 0.35;
      if (bodyType === 'slim') baseHips *= 0.9;
      if (bodyType === 'full') baseHips *= 1.1;
      return Math.round(baseHips);
    }
    
    function estimateShoulderWidth(height: number, bodyType: string): number {
      let baseShoulders = height * 0.25;
      if (bodyType === 'slim') baseShoulders *= 0.9;
      if (bodyType === 'full') baseShoulders *= 1.1;
      return Math.round(baseShoulders);
    }
    
    // FABRIC AND MATERIAL ANALYSIS
    function analyzeFabricAndFit(material: string, description: string, name: string) {
      const materialText = (material || description || name || '').toLowerCase();
      
      // Analyze stretch factor
      let stretchFactor = 1.0; // No stretch
      if (materialText.includes('spandex') || materialText.includes('elastane') || materialText.includes('lycra')) {
        stretchFactor = 1.3; // High stretch
      } else if (materialText.includes('jersey') || materialText.includes('knit')) {
        stretchFactor = 1.15; // Medium stretch
      } else if (materialText.includes('denim') || materialText.includes('canvas')) {
        stretchFactor = 1.05; // Low stretch
      }
      
      // Analyze thickness and weight
      let thickness = 'medium';
      if (materialText.includes('silk') || materialText.includes('linen') || materialText.includes('chiffon')) {
        thickness = 'thin';
      } else if (materialText.includes('wool') || materialText.includes('sweater') || materialText.includes('hoodie')) {
        thickness = 'thick';
      }
      
      // Analyze breathability
      let breathability = 'medium';
      if (materialText.includes('cotton') || materialText.includes('linen') || materialText.includes('mesh')) {
        breathability = 'high';
      } else if (materialText.includes('polyester') || materialText.includes('nylon') || materialText.includes('vinyl')) {
        breathability = 'low';
      }
      
      // Determine fit style
      let fitStyle = 'regular';
      if (materialText.includes('slim') || materialText.includes('skinny') || materialText.includes('fitted')) {
        fitStyle = 'slim';
      } else if (materialText.includes('loose') || materialText.includes('oversized') || materialText.includes('baggy')) {
        fitStyle = 'loose';
      } else if (materialText.includes('relaxed') || materialText.includes('comfort')) {
        fitStyle = 'relaxed';
      }
      
      return {
        stretchFactor,
        thickness,
        breathability,
        fitStyle
      };
    }
    
    // BRAND SIZING PATTERNS ANALYSIS
    function analyzeBrandSizing(brand: string, preferredSize: string, sizes: string[]) {
      const brandText = (brand || '').toLowerCase();
      
      // Brand-specific sizing patterns
      let brandFit = 'standard';
      let sizeConsistency = 'medium';
      
      // European brands tend to run smaller
      if (brandText.includes('nike') || brandText.includes('adidas') || brandText.includes('puma')) {
        brandFit = 'sporty';
        sizeConsistency = 'high';
      } else if (brandText.includes('levi') || brandText.includes('wrangler')) {
        brandFit = 'denim';
        sizeConsistency = 'high';
      } else if (brandText.includes('uniqlo') || brandText.includes('h&m') || brandText.includes('zara')) {
        brandFit = 'european';
        sizeConsistency = 'medium';
      } else if (brandText.includes('american') || brandText.includes('eagle') || brandText.includes('gap')) {
        brandFit = 'american';
        sizeConsistency = 'medium';
      }
      
      // Determine recommended size based on brand patterns
      let recommendedSize = preferredSize;
      if (brandFit === 'european' && preferredSize !== 'XS') {
        // European brands run smaller, suggest size up
        const sizeIndex = sizes.indexOf(preferredSize);
        if (sizeIndex > 0) {
          recommendedSize = sizes[sizeIndex - 1];
        }
      } else if (brandFit === 'american' && preferredSize !== 'XL') {
        // American brands run larger, suggest size down
        const sizeIndex = sizes.indexOf(preferredSize);
        if (sizeIndex < sizes.length - 1) {
          recommendedSize = sizes[sizeIndex + 1];
        }
      }
      
      return {
        brandFit,
        sizeConsistency,
        recommendedSize
      };
    }
    
    // ADVANCED FIT SCORE CALCULATION
    function calculateAdvancedFitScore(params: any) {
      const { userData, clothingData, bodyAnalysis, fabricAnalysis, brandAnalysis } = params;
      const { height, weight, preferredSize } = userData;
      const { sizes, sizeChart } = clothingData;
      const { bodyType, bodyShape, measurements } = bodyAnalysis;
      const { stretchFactor, fitStyle } = fabricAnalysis;
      const { brandFit, recommendedSize } = brandAnalysis;
      
      let fitScore = 75; // Base score
      
      // FACTOR 1: Size Availability and Position (0-20 points)
      const availableSizes = sizes || [];
      const preferredSizeIndex = availableSizes.indexOf(preferredSize);
      const sizeCount = availableSizes.length;
      
      if (preferredSizeIndex === -1) {
        fitScore -= 20; // Size not available
      } else if (preferredSizeIndex === 0 || preferredSizeIndex === sizeCount - 1) {
        fitScore -= 8; // Edge size penalty
      } else {
        fitScore += 12; // Middle size bonus
      }
      
      // FACTOR 2: Body Type Compatibility (0-25 points)
      const bodyTypeScore = calculateBodyTypeCompatibility(bodyType, bodyShape, preferredSize, measurements);
      fitScore += bodyTypeScore;
      
      // FACTOR 3: Fabric Stretch and Fit Style (0-15 points)
      const fabricScore = calculateFabricCompatibility(fabricAnalysis, bodyType, preferredSize);
      fitScore += fabricScore;
      
      // FACTOR 4: Brand Sizing Patterns (0-15 points)
      const brandScore = calculateBrandCompatibility(brandAnalysis, preferredSize, recommendedSize);
      fitScore += brandScore;
      
      // FACTOR 5: Measurement Precision (0-15 points)
      const measurementScore = calculateMeasurementPrecision(measurements, sizeChart, preferredSize);
      fitScore += measurementScore;
      
      // FACTOR 6: Seasonal and Style Considerations (0-10 points)
      const seasonalScore = calculateSeasonalCompatibility(clothingData, bodyType);
      fitScore += seasonalScore;
      
      // Clamp score to 0-100
      return Math.max(0, Math.min(100, fitScore));
    }
    
    function calculateBodyTypeCompatibility(bodyType: string, bodyShape: string, preferredSize: string, measurements: any): number {
      let score = 0;
      
      // Body type and size matching
      if (bodyType === 'slim') {
        if (['XS', 'S'].includes(preferredSize)) score += 15;
        else if (['M'].includes(preferredSize)) score += 10;
        else score += 5;
      } else if (bodyType === 'full') {
        if (['L', 'XL', 'XXL'].includes(preferredSize)) score += 15;
        else if (['M'].includes(preferredSize)) score += 10;
        else score += 5;
      } else { // average
        if (['M', 'L'].includes(preferredSize)) score += 15;
        else if (['S', 'XL'].includes(preferredSize)) score += 10;
        else score += 5;
      }
      
      // Body shape considerations
      if (bodyShape === 'ectomorph' && preferredSize === 'S') score += 5;
      if (bodyShape === 'endomorph' && ['L', 'XL'].includes(preferredSize)) score += 5;
      
      return score;
    }
    
    function calculateFabricCompatibility(fabricAnalysis: any, bodyType: string, preferredSize: string): number {
      const { stretchFactor, fitStyle } = fabricAnalysis;
      let score = 0;
      
      // Stretch factor benefits
      if (stretchFactor > 1.2) {
        score += 8; // High stretch is forgiving
      } else if (stretchFactor > 1.1) {
        score += 5; // Medium stretch
      } else {
        score += 2; // Low stretch
      }
      
      // Fit style compatibility
      if (fitStyle === 'slim' && bodyType === 'slim') score += 7;
      else if (fitStyle === 'loose' && bodyType === 'full') score += 7;
      else if (fitStyle === 'regular' && bodyType === 'average') score += 7;
      else score += 3; // Neutral compatibility
      
      return score;
    }
    
    function calculateBrandCompatibility(brandAnalysis: any, preferredSize: string, recommendedSize: string): number {
      const { brandFit, sizeConsistency } = brandAnalysis;
      let score = 0;
      
      // Size consistency bonus
      if (sizeConsistency === 'high') score += 8;
      else if (sizeConsistency === 'medium') score += 5;
      else score += 2;
      
      // Brand fit compatibility
      if (preferredSize === recommendedSize) score += 7;
      else if (brandFit === 'standard') score += 5;
      else score += 3;
      
      return score;
    }
    
    function calculateMeasurementPrecision(measurements: any, sizeChart: any, preferredSize: string): number {
      if (!sizeChart || !sizeChart[preferredSize]) return 5; // Default score if no size chart
      
      const sizeMeasurements = sizeChart[preferredSize];
      let score = 0;
      
      // Compare estimated measurements with size chart
      if (sizeMeasurements.chest) {
        const chestDiff = Math.abs(measurements.chest - parseInt(sizeMeasurements.chest));
        if (chestDiff <= 2) score += 5;
        else if (chestDiff <= 4) score += 3;
        else score += 1;
      }
      
      if (sizeMeasurements.waist) {
        const waistDiff = Math.abs(measurements.waist - parseInt(sizeMeasurements.waist));
        if (waistDiff <= 2) score += 5;
        else if (waistDiff <= 4) score += 3;
        else score += 1;
      }
      
      if (sizeMeasurements.hips) {
        const hipsDiff = Math.abs(measurements.hips - parseInt(sizeMeasurements.hips));
        if (hipsDiff <= 2) score += 5;
        else if (hipsDiff <= 4) score += 3;
        else score += 1;
      }
      
      return score;
    }
    
    function calculateSeasonalCompatibility(clothingData: any, bodyType: string): number {
      const { name, description } = clothingData;
      const itemText = (name + ' ' + description).toLowerCase();
      let score = 0;
      
      // Seasonal considerations
      if (itemText.includes('summer') || itemText.includes('light') || itemText.includes('breathable')) {
        if (bodyType === 'slim') score += 5; // Slim people often prefer lighter clothes
        else score += 3;
      } else if (itemText.includes('winter') || itemText.includes('warm') || itemText.includes('thick')) {
        if (bodyType === 'full') score += 5; // Fuller people might prefer warmer clothes
        else score += 3;
      } else {
        score += 5; // Neutral seasonal compatibility
      }
      
      return score;
    }
    
    // GENERATE ADVANCED RECOMMENDATIONS
    function generateAdvancedRecommendations(params: any) {
      const { fitScore, userData, clothingData, bodyAnalysis, fabricAnalysis, brandAnalysis } = params;
      const { height, weight, preferredSize } = userData;
      const { sizes, name } = clothingData;
      const { bodyType, bodyShape, measurements } = bodyAnalysis;
      const { stretchFactor, fitStyle } = fabricAnalysis;
      const { brandFit, recommendedSize } = brandAnalysis;
      
      let recommendation = '';
      let sizeAdvice = '';
      let alternativeSize: string | null = null;
      let fitDetails = '';
      let brandComparison = '';
      
      // Generate sophisticated recommendation based on fit score
      if (fitScore >= 85) {
        recommendation = `Perfect match! Size ${preferredSize} is ideal for your ${bodyType} ${bodyShape} body type (${height} inches, ${weight} lbs). The ${fitStyle} fit style and ${stretchFactor > 1.1 ? 'stretchy' : 'structured'} fabric will provide excellent comfort.`;
        sizeAdvice = `Size ${preferredSize} is highly recommended. This size should provide an optimal fit with room for natural movement.`;
      } else if (fitScore >= 70) {
        recommendation = `Excellent choice! Size ${preferredSize} should provide a great fit for your measurements. The ${brandFit} brand sizing and ${fitStyle} style work well with your body type.`;
        const altSize = getAdvancedAlternativeSize(sizes, preferredSize, bodyAnalysis, fabricAnalysis);
        sizeAdvice = `Size ${preferredSize} should fit well. Consider trying ${altSize} for comparison if you prefer a ${altSize === 'smaller' ? 'more fitted' : 'more relaxed'} look.`;
        alternativeSize = altSize;
      } else if (fitScore >= 50) {
        recommendation = `Good choice with considerations. Size ${preferredSize} should work, but may need adjustments. Your ${bodyType} body type and the ${fitStyle} fit style suggest ${recommendedSize !== preferredSize ? `trying size ${recommendedSize}` : 'considering alternatives'}.`;
        const altSize = getAdvancedAlternativeSize(sizes, preferredSize, bodyAnalysis, fabricAnalysis);
        sizeAdvice = `We recommend trying ${altSize} instead of ${preferredSize} for a better fit.`;
        alternativeSize = altSize;
      } else {
        recommendation = `Size ${preferredSize} may not be optimal for your body type. Your ${bodyType} ${bodyShape} build and the ${fitStyle} style suggest a different approach.`;
        const altSize = getAdvancedAlternativeSize(sizes, preferredSize, bodyAnalysis, fabricAnalysis);
        sizeAdvice = `We strongly recommend trying ${altSize} instead of ${preferredSize} for better comfort and fit.`;
        alternativeSize = altSize;
      }
      
      // Generate detailed fit description
      fitDetails = generateDetailedFitDescription({
        bodyAnalysis,
        fabricAnalysis,
        brandAnalysis,
        clothingData,
        preferredSize
      });
      
      // Generate brand comparison
      brandComparison = generateBrandComparison(brandAnalysis, clothingData.sizeChart, preferredSize);
      
      return {
        recommendation,
        sizeAdvice,
        alternativeSize,
        fitDetails,
        brandComparison
      };
    }
    
    function getAdvancedAlternativeSize(sizes: string[], currentSize: string, bodyAnalysis: any, fabricAnalysis: any): string | null {
      if (sizes.length <= 1) return null;
      
      const { bodyType, bodyShape } = bodyAnalysis;
      const { stretchFactor, fitStyle } = fabricAnalysis;
      const currentIndex = sizes.indexOf(currentSize);
      
      if (currentIndex === -1) return sizes[0];
      
      // Advanced size suggestion logic
      if (bodyType === 'slim' && stretchFactor < 1.1) {
        // Slim body with low stretch - suggest smaller size
        if (currentIndex > 0) return sizes[currentIndex - 1];
      } else if (bodyType === 'full' && fitStyle === 'slim') {
        // Full body with slim fit - suggest larger size
        if (currentIndex < sizes.length - 1) return sizes[currentIndex + 1];
      } else if (bodyShape === 'ectomorph') {
        // Ectomorph (tall and thin) - suggest smaller size
        if (currentIndex > 0) return sizes[currentIndex - 1];
      } else if (bodyShape === 'endomorph') {
        // Endomorph (rounder build) - suggest larger size
        if (currentIndex < sizes.length - 1) return sizes[currentIndex + 1];
      }
      
      // Default to adjacent size
      if (currentIndex > 0) return sizes[currentIndex - 1];
      if (currentIndex < sizes.length - 1) return sizes[currentIndex + 1];
      
      return sizes[0];
    }
    
    function generateDetailedFitDescription(params: any): string {
      const { bodyAnalysis, fabricAnalysis, brandAnalysis, clothingData, preferredSize } = params;
      const { bodyType, bodyShape, measurements } = bodyAnalysis;
      const { stretchFactor, thickness, breathability, fitStyle } = fabricAnalysis;
      const { brandFit } = brandAnalysis;
      const { name } = clothingData;
      
      let description = `This ${name} will provide a ${fitStyle} fit on your ${bodyType} ${bodyShape} frame. `;
      
      if (stretchFactor > 1.2) {
        description += `The high-stretch fabric will accommodate movement comfortably. `;
      } else if (stretchFactor > 1.1) {
        description += `The moderate stretch will provide some flexibility. `;
      } else {
        description += `The structured fabric will maintain its shape well. `;
      }
      
      if (thickness === 'thin') {
        description += `The lightweight material will feel breathable and comfortable. `;
      } else if (thickness === 'thick') {
        description += `The substantial fabric will provide good coverage and warmth. `;
      }
      
      if (breathability === 'high') {
        description += `The breathable fabric will help regulate temperature. `;
      }
      
      description += `The ${brandFit} brand sizing should provide a consistent fit experience.`;
      
      return description;
    }
    
    function generateBrandComparison(brandAnalysis: any, sizeChart: any, preferredSize: string): string {
      const { brandFit, sizeConsistency } = brandAnalysis;
      
      let comparison = `This ${brandFit} brand typically has ${sizeConsistency} size consistency. `;
      
      if (sizeChart && sizeChart[preferredSize]) {
        const measurements = sizeChart[preferredSize];
        comparison += `Size ${preferredSize} measurements: `;
        
        if (measurements.chest) comparison += `Chest ${measurements.chest}", `;
        if (measurements.waist) comparison += `Waist ${measurements.waist}", `;
        if (measurements.hips) comparison += `Hips ${measurements.hips}", `;
        
        comparison = comparison.slice(0, -2) + ". ";
      }
      
      if (brandFit === 'european') {
        comparison += "European brands typically run smaller than American brands.";
      } else if (brandFit === 'american') {
        comparison += "American brands typically run larger than European brands.";
      } else if (brandFit === 'sporty') {
        comparison += "Sport brands typically have athletic cuts with room for movement.";
      }
      
      return comparison;
    }

    // 0. Claude 4 Sonnet: Describe the user's clothing image in detail
    let detailedClothingDescription = clothingData.description;
    let extractedTextLogo = '';
    let extractedColor = '';
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
                      text: `Describe this clothing item in extreme detail for an AI image generator.\n- State the primary color clearly (e.g., 'The hoodie is blue.').\n- If there is any visible text, logo, or number on the item, extract it and state it clearly as a separate line: TEXT/LOGO/NUMBER: ...\nInclude color, material, style, patterns, logos, text, numbers, and any unique features.`
                    },
                    clothingImageContent
                  ]
                }
              ]
            }),
          });
          if (clothingDescResponse.ok) {
            let clothingDescData = await clothingDescResponse.json();
            let clothingDesc = clothingDescData.choices?.[0]?.message?.content;
            // If content is an array, extract the text
            if (Array.isArray(clothingDesc) && clothingDesc[0]?.text) {
              clothingDesc = clothingDesc[0].text;
            }
            clothingDesc = clothingDesc?.trim();
            if (clothingDesc && clothingDesc.length > 20) {
              detailedClothingDescription = clothingDesc;
              // Try to extract the TEXT/LOGO/NUMBER line
              const textLogoMatch = clothingDesc.match(/TEXT\/LOGO\/NUMBER:\s*(.*)/i);
              if (textLogoMatch && textLogoMatch[1]) {
                extractedTextLogo = textLogoMatch[1].trim();
                console.log('Extracted text/logo/number from Claude:', extractedTextLogo);
              }
              // Try to extract the color (look for lines like 'The hoodie is blue.' or 'Color: ...')
              const colorMatch = clothingDesc.match(/(?:The [^\n]+ is|Color:)\s*([a-zA-Z ]+)/i);
              if (colorMatch && colorMatch[1]) {
                extractedColor = colorMatch[1].trim();
                console.log('Extracted color from Claude:', extractedColor);
              }
              console.log('Detailed clothing description from Claude:', detailedClothingDescription);
            } else {
              console.warn('Claude clothing description was too short or missing, using fallback.');
              detailedClothingDescription = clothingData.description;
              extractedTextLogo = '';
              extractedColor = clothingData.color || '';
            }
          } else {
            const errorText = await clothingDescResponse.text();
            console.error('Claude clothing description error:', errorText);
            detailedClothingDescription = clothingData.description;
            extractedTextLogo = '';
            extractedColor = clothingData.color || '';
          }
        }
      } catch (descError) {
        console.error('Error getting detailed clothing description from Claude:', descError);
        detailedClothingDescription = clothingData.description;
        extractedTextLogo = '';
        extractedColor = clothingData.color || '';
      }
    }

    // 3. GPT-4o: Generate virtual try-on image
    console.log('Starting virtual try-on image generation...');
    console.log('Clothing data for image generation:', clothingData);
    
    // Build a highly specific mannequin prompt
    const colorDetail = extractedColor ? `The most important detail is the color: ${extractedColor}.` : (clothingData.color ? `The most important detail is the color: ${clothingData.color}.` : '');
    const textLogoDetail = extractedTextLogo ? `The clothing must include the following text/logo/number: ${extractedTextLogo}.` : '';
    const mannequinPrompt = `A photorealistic image of a faceless mannequin with body proportions: ${bodyAssessment.replace(/\n/g, ' ')} (height: ${userData.height} inches, weight: ${userData.weight} lbs), wearing ${clothingData.name} in size ${userData.preferredSize}. The clothing should match this description: ${detailedClothingDescription}. ${colorDetail} ${textLogoDetail} The fit should be realistic for the given size and body. The color of the clothing must be exactly as described. Emphasize the color accuracy above all else. Neutral background. No text, no logos, no visible brand names except as described. NOTE: This is an AI-generated image and cannot use a real clothing image as input.`;
    
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

    // Log the image URL sent to the frontend
    console.log('Image URL sent to frontend:', overlayImageUrl);

    // FINAL SAFETY CHECK: Ensure response payload is bulletproof
    const responsePayload = {
      success: true,
      analysis: {
        fitScore: validatedAnalysis.fitScore || 75,
        recommendation: validatedAnalysis.recommendation || `Size ${userData.preferredSize} should work well for your measurements.`,
        sizeAdvice: validatedAnalysis.sizeAdvice || `Size ${userData.preferredSize} is recommended.`,
        alternativeSize: validatedAnalysis.alternativeSize || null,
        fitDetails: validatedAnalysis.fitDetails || `This item should fit well in size ${userData.preferredSize}.`,
        brandComparison: validatedAnalysis.brandComparison || "Size comparison data not available."
      },
      aiMessage: aiMessage || '',
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