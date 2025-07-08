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

    if (!firecrawlApiKey) {
      throw new Error('Firecrawl API key not configured');
    }

    console.log('Scraping clothing URL:', url);

    // Use Firecrawl to scrape the clothing page
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
    const clothingData = {
      name: extractedData.name || scrapedData.data?.metadata?.title || 'Unknown Item',
      price: extractedData.price || 'Price not found',
      sizes: extractedData.sizes || ['S', 'M', 'L', 'XL'],
      images: extractedData.images || [scrapedData.data?.metadata?.ogImage] || [],
      sizeChart: {},
      description: extractedData.description || scrapedData.data?.metadata?.description || '',
      material: extractedData.material || '',
      scrapedContent: scrapedData.data?.markdown || ''
    };

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