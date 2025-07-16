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

    let clothingData;

    if (firecrawlApiKey) {
      // Use Firecrawl if API key is available
      try {
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: url,
            formats: ['extract'],
            extract: {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Product name' },
                  price: { type: 'string', description: 'Product price' },
                  sizes: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'Available sizes'
                  },
                  images: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'Product image URLs'
                  },
                  description: { type: 'string', description: 'Product description' },
                  material: { type: 'string', description: 'Material/fabric information' }
                }
              }
            }
          }),
        });

        if (!response.ok) {
          throw new Error(`Firecrawl API error: ${response.status}`);
        }

        const scrapedData = await response.json();
        console.log('Scraped data:', scrapedData);

        // Extract structured data from Firecrawl v1 response
        const extractedData = scrapedData.data?.extract || {};
        clothingData = {
          name: extractedData.name || scrapedData.data?.metadata?.title || 'Unknown Item',
          price: extractedData.price || 'Price not found',
          sizes: extractedData.sizes || ['S', 'M', 'L', 'XL'],
          images: extractedData.images || [scrapedData.data?.metadata?.ogImage] || [],
          sizeChart: {},
          description: extractedData.description || scrapedData.data?.metadata?.description || '',
          material: extractedData.material || '',
          scrapedContent: scrapedData.data?.markdown || ''
        };
      } catch (firecrawlError) {
        console.warn('Firecrawl failed, using fallback method:', firecrawlError.message);
        // Fall through to fallback method
      }
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
          scrapedContent: html.substring(0, 1000) // First 1000 chars for debugging
        };
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
          scrapedContent: ''
        };
      }
    }

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