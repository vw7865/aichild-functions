const fetch = require('node-fetch');

// Replicate API configuration
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_API_URL = 'https://api.replicate.com/v1/predictions';

if (!REPLICATE_API_TOKEN) {
  console.warn('REPLICATE_API_TOKEN is not set. Replicate API calls will fail.');
}

// Helper function to call Replicate API
async function callReplicate(version, input, pollIntervalMs = 1000, timeoutMs = 120000) {
  if (!REPLICATE_API_TOKEN) {
    throw new Error('Replicate API token is not configured.');
  }

  const requestBody = {
    version,
    input,
  };

  console.log(`Calling Replicate API for version: ${version}`);
  console.log('Input:', input);

  const startResponse = await fetch(REPLICATE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    console.error(`Replicate API start error (${startResponse.status}): ${errorText}`);
    throw new Error(`Replicate API start failed: ${startResponse.statusText} - ${errorText}`);
  }

  const initialPrediction = await startResponse.json();
  console.log('Initial Replicate prediction response:', initialPrediction);

  if (initialPrediction.error) {
    throw new Error(`Replicate API returned an error: ${initialPrediction.error}`);
  }

  if (!initialPrediction.urls?.get) {
    throw new Error('Replicate API did not return a GET URL for polling.');
  }

  const startTime = Date.now();
  let prediction = initialPrediction;

  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled') {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error('Replicate API polling timed out.');
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

    const pollResponse = await fetch(prediction.urls.get, {
      headers: {
        'Authorization': `Token ${REPLICATE_API_TOKEN}`,
      },
    });

    if (!pollResponse.ok) {
      const errorText = await pollResponse.text();
      console.error(`Replicate API poll error (${pollResponse.status}): ${errorText}`);
      throw new Error(`Replicate API poll failed: ${pollResponse.statusText} - ${errorText}`);
    }

    prediction = await pollResponse.json();
    console.log(`Polling Replicate API... Status: ${prediction.status}`);

    if (prediction.error) {
      throw new Error(`Replicate API returned an error during polling: ${prediction.error}`);
    }
  }

  if (prediction.status === 'succeeded' && prediction.output && prediction.output.length > 0) {
    console.log('Replicate API call succeeded. Output:', prediction.output[0]);
    return prediction.output[0];
  } else {
    throw new Error(`Replicate API call failed or was canceled. Status: ${prediction.status}. Error: ${prediction.error || 'None'}`);
  }
}

// Test function to check API connection
async function testAPI() {
  try {
    console.log('Testing Replicate API connection...');
    console.log('API Token exists:', !!REPLICATE_API_TOKEN);
    console.log('API Token length:', REPLICATE_API_TOKEN ? REPLICATE_API_TOKEN.length : 0);
    
    // Test with a simple model
    const result = await callReplicate(
      "falcons-ai/nsfw_image_detection",
      { image: "https://aichild.webhop.me/files/SwR4n5k0DdZjeCzTOcOizshOXv82/xNCQzC0T3ghMgGBp8YSV/mother.png" }
    );
    
    return { success: true, result };
  } catch (error) {
    console.error('API test failed:', error);
    return { success: false, error: error.message };
  }
}

// Baby Generation
async function generateBaby(momUrl, dadUrl) {
  console.log(`Generating baby from mom: ${momUrl}, dad: ${dadUrl}`);
  const result = await callReplicate(
    "smoosh-sh/baby-mystic",
    {
      image: momUrl,
      image2: dadUrl,
      num_inference_steps: 50,
      guidance_scale: 15
    }
  );
  return result;
}

// Netlify Function handler
exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    console.log('Received baby generation request');
    const { momUrl, dadUrl, test } = JSON.parse(event.body);

    // If test=true, just test the API connection
    if (test) {
      const testResult = await testAPI();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          test: true,
          ...testResult
        }),
      };
    }

    if (!momUrl || !dadUrl) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Both momUrl and dadUrl are required.',
          success: false 
        }),
      };
    }

    const babyUrl = await generateBaby(momUrl, dadUrl);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        babyUrl,
        success: true,
        message: 'Baby generated successfully'
      }),
    };

  } catch (error) {
    console.error('Error in baby generation:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'An unknown error occurred',
        success: false,
      }),
    };
  }
};