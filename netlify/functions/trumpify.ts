import { Mistral } from "@mistralai/mistralai";
import type { Context } from "@netlify/functions";
import { WebClient } from "@slack/web-api";

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

  return (response.choices?.[0]?.message?.content as string) || text;
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

  // Extract slash command data (thread_ts is present when used in a thread)
  const { text, user_id, channel_id, thread_ts } = payload;

  // Optional: Restrict to specific users (comma-separated user IDs in env var)
  const allowedUsers = process.env.ALLOWED_USER_IDS?.split(",").map((id) => id.trim());
  if (allowedUsers && allowedUsers.length > 0 && !allowedUsers.includes(user_id)) {
    return new Response(
      JSON.stringify({
        response_type: "ephemeral",
        text: "Sorry, you don't have permission to use this command.",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  if (!text || !text.trim()) {
    return new Response(
      JSON.stringify({
        response_type: "ephemeral",
        text: "Please provide a message to trumpify! Usage: `/trumpify your message here`",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    console.log("Starting trumpify for user:", user_id);

    const trumpified = await trumpifyText(text);
    console.log("Trumpified text:", trumpified);

    // Post via Slack API as the user
    const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

    // Get user info for name and avatar
    const userInfo = await slack.users.info({ user: user_id });
    const userName = userInfo.user?.real_name || userInfo.user?.name || "Someone";
    const userIcon = userInfo.user?.profile?.image_72;

    try {
      await slack.chat.postMessage({
        channel: channel_id,
        text: trumpified,
        username: userName,
        icon_url: userIcon,
        thread_ts: thread_ts, // Reply in thread if command was used in a thread
        unfurl_links: false,
      });

      console.log("Posted successfully");

      // Return empty response - no echo of the original command
      return new Response("", { status: 200 });
    } catch (postError: any) {
      // If we can't post to the channel (e.g., bot not in private channel or DM),
      // fall back to ephemeral response visible only to the user
      if (postError?.data?.error === "channel_not_found" || postError?.data?.error === "not_in_channel") {
        console.log("Cannot post to channel, returning ephemeral response");
        return new Response(
          JSON.stringify({
            response_type: "ephemeral",
            text: `🎺 Trumpified version:\n\n${text}\n\n${trumpified}`,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
      // Re-throw other errors
      throw postError;
    }
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
