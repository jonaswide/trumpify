import type { Context } from "@netlify/functions";
import { Mistral } from "@mistralai/mistralai";

const TRUMP_SYSTEM_PROMPT = `You are a translator that rewrites messages in Donald Trump's distinctive speaking style. 

Key characteristics to emulate:
- Superlatives and exaggeration ("the best", "tremendous", "huge", "like never before")
- Repetition for emphasis ("Very, very bad. Very bad.")
- Self-references and boasting
- Simple, punchy sentences mixed with run-on thoughts
- Nicknames and colorful insults for things/people being criticized
- Phrases like "Believe me", "Let me tell you", "Many people are saying", "Everyone knows"
- Dramatic declarations ("It's a disaster!", "Total failure!", "Unbelievable!")
- Casual asides and tangents

Keep the core meaning and intent of the original message, but transform the tone and style completely. Keep the response concise - don't make it much longer than the original. Output ONLY the trumpified message, no explanations.`;

async function trumpifyText(text: string): Promise<string> {
  const mistral = new Mistral({
    apiKey: process.env.MISTRAL_API_KEY!,
  });

  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [
      { role: "system", content: TRUMP_SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    temperature: 0.8,
    maxTokens: 1024,
  });

  return response.choices?.[0]?.message?.content as string || text;
}


function parseFormData(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

export default async function handler(req: Request, _context: Context) {
  // Verify this is a POST request
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();
  const payload = parseFormData(body);

  // Verify the request is from Slack
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
  if (!slackSigningSecret) {
    console.error("Missing SLACK_SIGNING_SECRET");
    return new Response("Server configuration error", { status: 500 });
  }

  // Handle Slack URL verification challenge
  if (payload.type === "url_verification") {
    return new Response(JSON.stringify({ challenge: payload.challenge }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Extract slash command data
  const { text, response_url } = payload;

  if (!text || !text.trim()) {
    return new Response(
      JSON.stringify({
        response_type: "ephemeral",
        text: "Please provide a message to trumpify! Usage: `/trumpify your message here`",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // Process the request
  try {
    console.log("Starting trumpify, response_url:", response_url);
    
    const trumpified = await trumpifyText(text);
    console.log("Trumpified text:", trumpified);
    
    // Post to response_url - this shows as coming from the user
    await fetch(response_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response_type: "in_channel",
        text: trumpified,
      }),
    });
    
    console.log("Posted successfully");
    return new Response("", { status: 200 });
  } catch (error) {
    console.error("Error processing trumpify request:", error);
    
    return new Response(
      JSON.stringify({
        response_type: "ephemeral",
        text: `Sorry, something went wrong: ${error instanceof Error ? error.message : "Unknown error"}`,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}

export const config = {
  path: "/api/trumpify",
};
