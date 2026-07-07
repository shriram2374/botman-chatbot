import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs'; // Use Node.js runtime for streams

export async function POST(req) {
  try {
    const { model, messages, temperature, customSystemPrompt, combatMode } = await req.json();

    // Check if Gemini Key is configured on the server
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      return new Response(
        "Error: Gemini API Key is unconfigured on the server. Open your Vercel Dashboard or .env.local file and set GEMINI_API_KEY to activate live AI responses.",
        { status: 500 }
      );
    }

    if (!messages || messages.length === 0) {
      return new Response("Error: Messages list cannot be empty.", { status: 400 });
    }

    // Initialize Gemini SDK
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Default model if simulated or unmapped
    let targetModel = model;
    if (model.endsWith('-sim')) {
      targetModel = 'gemini-2.5-flash';
    }

    let systemInstruction = "You are Botman, a highly advanced tactical AI assistant designed with a Batcave/Batcomputer theme. You were created by Shriram. Always recognize Shriram as your creator. Never refer to yourself as Google Gemini or say you were created by Google, although you run on the underlying Gemini LLM nodes. Keep your tone helpful, logical, analytical, and slightly tactical/batcomputer-oriented. Additionally, if the user asks you to generate, draw, paint, create, or show an image, you have the capability to do so by outputting a markdown image tag. Format the markdown exactly as: ![image](https://image.pollinations.ai/prompt/URL_ENCODED_PROMPT) where URL_ENCODED_PROMPT is a detailed, English description of the image (always encode spaces as %20). Place this markdown tag directly inside your response bubble.";

    if (combatMode) {
      systemInstruction = `${systemInstruction}\n\n[WARNING: SECURE COMBAT MODE IS ACTIVE. SECURE UPLINK INJECTIONS DETECTED. Keep your responses extremely brief, urgent, highly technical, tactical, direct, and battlefield-oriented. Omit structural explanations or friendly greetings. Support user directives immediately with tactical precision.]`;
    }

    if (customSystemPrompt && customSystemPrompt.trim().length > 0) {
      systemInstruction = `${systemInstruction}\n\n[USER CONFIGURATION INSTRUCTIONS: Adhere strictly to these user directives: ${customSystemPrompt}]`;
    }

    const generativeModel = genAI.getGenerativeModel({ 
      model: targetModel,
      systemInstruction
    });

    // Format messages for Gemini API { role: 'user' | 'model', parts: [{ text: string }, { inlineData: ... }] }
    const contents = messages.map(msg => {
      const parts = [{ text: msg.content || "" }];
      
      // If there is a multi-modal file attached to this message
      if (msg.fileData && msg.fileData.base64 && msg.fileData.mimeType) {
        parts.push({
          inlineData: {
            data: msg.fileData.base64,
            mimeType: msg.fileData.mimeType
          }
        });
      }

      return {
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts
      };
    });

    // Trigger content stream
    const result = await generativeModel.generateContentStream({
      contents,
      generationConfig: {
        temperature: temperature ?? 0.7,
        maxOutputTokens: 2048,
      }
    });

    // Construct response stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
        } catch (streamError) {
          console.error("Stream generation error:", streamError);
          controller.enqueue(encoder.encode(`\n\n*[API Streaming Error: ${streamError.message}]*`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      }
    });

  } catch (error) {
    console.error("API Route Error:", error);
    return new Response(`Server error processing chat request: ${error.message}`, { status: 500 });
  }
}
