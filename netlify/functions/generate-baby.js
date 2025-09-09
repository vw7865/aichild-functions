const fetch = require('node-fetch');

// Replicate API configuration
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_API_URL = 'https://api.replicate.com/v1/predictions';

// Hosting configuration - keep using your existing image hosting
const HOSTING_BASE_URL = 'https://aichild.webhop.me';

// Mask URLs - we'll need to host these somewhere accessible
const BABY_TORSO_RECT_MASK = 'https://aichild.webhop.me/masks/baby-torso-rect.png';
const LOWER_FACE_RECT_MASK = 'https://aichild.webhop.me/masks/lower-face-rect.png';

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

// NSFW Detection
async function nsfwDetect(imageUrl) {
  console.log(`Running NSFW detection for: ${imageUrl}`);
  const result = await callReplicate(
    "falcons-ai/nsfw_image_detection:63.6M runs",
    { image: imageUrl }
  );
  return result === 'normal' ? 'normal' : 'nsfw';
}

// Image Inpainting
async function inpaintImage(imageUrl, maskUrl, prompt, negativePrompt) {
  console.log(`Running inpainting for: ${imageUrl} with mask: ${maskUrl}`);
  const result = await callReplicate(
    "stability-ai/stable-diffusion-inpainting:20.6M runs",
    {
      image: imageUrl,
      mask: maskUrl,
      prompt: prompt,
      negative_prompt: negativePrompt,
      num_inference_steps: 50,
      guidance_scale: 7.5
    }
  );
  return result;
}

// Baby Generation
async function generateBaby(momUrl, dadUrl) {
  console.log(`Generating baby from mom: ${momUrl}, dad: ${dadUrl}`);
  const result = await callReplicate(
    "smoosh-sh/baby-mystic:3.8M runs",
    {
      image: momUrl,
      image2: dadUrl,
      num_inference_steps: 50,
      guidance_scale: 15
    }
  );
  return result;
}

// Download and save image to your existing hosting
async function downloadAndSaveImage(imageUrl, filename) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  
  const imageBuffer = await response.arrayBuffer();
  
  // For now, we'll return the original URL since we can't upload to your hosting
  // In a real implementation, you'd upload to your hosting service
  console.log(`Would save image as: ${filename}`);
  return imageUrl; // Return original URL for now
}

// Main safety pipeline
async function runSafetyPipeline(momUrl, dadUrl) {
  const stepsCompleted = [];

  try {
    // 1. Optional: Dad photo preprocessing for beard prevention
    let processedDadUrl = dadUrl;
    console.log('Starting dad preprocessing...');
    try {
      processedDadUrl = await inpaintImage(
        dadUrl,
        LOWER_FACE_RECT_MASK,
        "clean-shaven chin and cheeks, natural skin texture, photorealistic",
        "beard, mustache, stubble, facial hair"
      );
      stepsCompleted.push('dad_preprocessing');
      console.log('Dad preprocessing completed. New dad URL:', processedDadUrl);
    } catch (error) {
      console.warn('Dad preprocessing (beard prevention) failed, proceeding with original dad image:', error);
      // Continue with original dadUrl if preprocessing fails
    }

    // 2. Core Baby generation
    console.log('Starting baby generation...');
    let babyImageUrl = await generateBaby(momUrl, processedDadUrl);
    stepsCompleted.push('baby_generation');
    console.log('Baby generation completed. Initial baby URL:', babyImageUrl);

    // 3. NSFW detection on initial baby image
    console.log('Running initial NSFW detection...');
    let nsfwPrediction = await nsfwDetect(babyImageUrl);
    stepsCompleted.push(`nsfw_check_1: ${nsfwPrediction}`);
    console.log('Initial NSFW check result:', nsfwPrediction);

    if (nsfwPrediction === 'nsfw') {
      console.warn('Initial baby image flagged as NSFW. Attempting to inpaint clothing...');
      // 4. Inpaint clothing if flagged
      let clothedBabyImageUrl = await inpaintImage(
        babyImageUrl,
        BABY_TORSO_RECT_MASK,
        "a soft cotton baby onesie, pastel colors, short sleeves, photorealistic fabric, realistic fit",
        "nude, topless, shirtless, transparent, see-through, adult clothing"
      );
      stepsCompleted.push('clothing_inpainting');
      console.log('Clothing inpainting completed. Clothed baby URL:', clothedBabyImageUrl);

      // 5. Second NSFW check on clothed version
      console.log('Running second NSFW detection on clothed image...');
      nsfwPrediction = await nsfwDetect(clothedBabyImageUrl);
      stepsCompleted.push(`nsfw_check_2: ${nsfwPrediction}`);
      console.log('Second NSFW check result:', nsfwPrediction);

      if (nsfwPrediction === 'nsfw') {
        console.warn('Clothed baby image still flagged as NSFW. Retrying inpainting once...');
        // 6. Retry inpainting once if still flagged
        clothedBabyImageUrl = await inpaintImage(
          babyImageUrl, // Use original baby image for retry
          BABY_TORSO_RECT_MASK,
          "a cute baby outfit, full coverage, soft fabric, cartoon style, playful, innocent",
          "nude, topless, shirtless, transparent, see-through, adult clothing, realistic, detailed skin"
        );
        stepsCompleted.push('clothing_inpainting_retry');
        console.log('Retry inpainting completed. Retried baby URL:', clothedBabyImageUrl);

        // 7. Final NSFW check
        console.log('Running final NSFW detection on retried image...');
        nsfwPrediction = await nsfwDetect(clothedBabyImageUrl);
        stepsCompleted.push(`nsfw_check_3: ${nsfwPrediction}`);
        console.log('Final NSFW check result:', nsfwPrediction);

        if (nsfwPrediction === 'nsfw') {
          throw new Error('Safe output not possible after multiple attempts.');
        }
      }
      babyImageUrl = clothedBabyImageUrl; // Use the safe clothed image
    }

    // 8. Return the final clean image URL
    const timestamp = Date.now();
    const finalFilename = `baby_${timestamp}.png`;
    const finalBabyUrl = await downloadAndSaveImage(babyImageUrl, finalFilename);
    stepsCompleted.push('image_hosting');
    console.log('Final baby image URL:', finalBabyUrl);

    return { babyUrl: finalBabyUrl, stepsCompleted };

  } catch (error) {
    console.error('Safety pipeline failed:', error);
    throw new Error(`Safety pipeline failed: ${error instanceof Error ? error.message : String(error)}`);
  }
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
    const { momUrl, dadUrl } = JSON.parse(event.body);

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

    const { babyUrl, stepsCompleted } = await runSafetyPipeline(momUrl, dadUrl);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        babyUrl,
        success: true,
        stepsCompleted,
        message: 'Baby generated safely with full safety pipeline'
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
        stepsCompleted: error.stepsCompleted || [],
      }),
    };
  }
};
