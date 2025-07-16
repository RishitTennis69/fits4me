import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const { url } = await req.json();
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    console.log('Scraping clothing URL:', url);
    console.log('Firecrawl API key available:', !!firecrawlApiKey);

    let clothingData;

    if (firecrawlApiKey) {
      // Use Firecrawl if API key is available
      try {
        console.log('Attempting Firecrawl API call...');
        
        const firecrawlPayload = {
          url: url,
          formats: ['extract'],
          extract: {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Product name or title' },
                price: { type: 'string', description: 'Product price in any format' },
                sizes: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Available sizes (XS, S, M, L, XL, etc.)'
                },
                images: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Product image URLs'
                },
                description: { type: 'string', description: 'Product description' },
                material: { type: 'string', description: 'Material/fabric information' },
                brand: { type: 'string', description: 'Brand name' }
              },
              required: ['name']
            }
          }
        };

        console.log('Firecrawl payload:', JSON.stringify(firecrawlPayload, null, 2));

        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(firecrawlPayload),
        });

        console.log('Firecrawl response status:', response.status);
        console.log('Firecrawl response headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Firecrawl API error response:', errorText);
          throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`);
        }

        const scrapedData = await response.json();
        console.log('Firecrawl raw response:', JSON.stringify(scrapedData, null, 2));

        // Extract structured data from Firecrawl response
        const extractedData = scrapedData.data?.extract || {};
        console.log('Extracted data from Firecrawl:', extractedData);

        if (extractedData && Object.keys(extractedData).length > 0) {
          clothingData = {
            name: extractedData.name || scrapedData.data?.metadata?.title || 'Unknown Item',
            price: extractedData.price || 'Price not found',
            sizes: extractedData.sizes || ['S', 'M', 'L', 'XL'],
            images: extractedData.images || [scrapedData.data?.metadata?.ogImage] || [],
            sizeChart: {},
            description: extractedData.description || scrapedData.data?.metadata?.description || '',
            material: extractedData.material || '',
            brand: extractedData.brand || '',
            scrapedContent: scrapedData.data?.markdown || ''
          };
          
          console.log('Successfully extracted clothing data from Firecrawl:', clothingData);
        } else {
          console.warn('Firecrawl returned empty extracted data, using fallback');
          throw new Error('No extracted data from Firecrawl');
        }
      } catch (firecrawlError) {
        console.error('Firecrawl failed with error:', firecrawlError.message);
        console.error('Firecrawl error stack:', firecrawlError.stack);
        // Fall through to fallback method
      }
    } else {
      console.log('No Firecrawl API key provided, using fallback method');
    }

    // Fallback method if Firecrawl is not available or fails
    if (!clothingData) {
      console.log('Using fallback scraping method');
      
      try {
        // Basic web scraping fallback
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch URL: ${response.status}`);
        }

        const html = await response.text();
        console.log('Fallback: Successfully fetched HTML, length:', html.length);
        
        // Basic extraction using regex patterns
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
        const priceMatch = html.match(/\$[\d,]+\.?\d*/);
        const imageMatch = html.match(/<img[^>]*src="([^"]+)"[^>]*>/i);
        const descriptionMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);

        clothingData = {
          name: ogTitleMatch?.[1] || titleMatch?.[1] || 'Unknown Item',
          price: priceMatch?.[0] || 'Price not found',
          sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], // Default sizes
          images: imageMatch?.[1] ? [imageMatch[1]] : [],
          sizeChart: {},
          description: descriptionMatch?.[1] || 'No description available',
          material: 'Material information not available',
          brand: '',
          scrapedContent: html.substring(0, 1000) // First 1000 chars for debugging
        };
        
        console.log('Fallback: Extracted clothing data:', clothingData);
      } catch (fallbackError) {
        console.error('Fallback scraping also failed:', fallbackError);
        // Return a basic structure if all methods fail
        clothingData = {
          name: 'Clothing Item',
          price: 'Price not available',
          sizes: ['S', 'M', 'L', 'XL'],
          images: [],
          sizeChart: {},
          description: 'Unable to scrape product information. Please try again or enter details manually.',
          material: 'Unknown',
          brand: '',
          scrapedContent: ''
        };
      }
    }

    console.log('Final clothing data being returned:', clothingData);

    return new Response(JSON.stringify({ 
      success: true, 
      data: clothingData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in scrape-clothing function:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});