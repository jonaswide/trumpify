import type { Context } from "@netlify/functions";
import { Mistral } from "@mistralai/mistralai";
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

  return response.choices?.[0]?.message?.content as string || text;
}

async function postToSlack(
  channelId: string,
  userId: string,
  originalText: string,
  trumpifiedText: string,
  threadTs?: string
): Promise<void> {
  const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

  // Get user info to include their name
  const userInfo = await slack.users.info({ user: userId });
  const userName = userInfo.user?.real_name || userInfo.user?.name || "Someone";

  // Post the trumpified message (in thread if threadTs provided)
  const mainMessage = await slack.chat.postMessage({
    channel: channelId,
    text: `*${userName} says:*\n${trumpifiedText}`,
    thread_ts: threadTs, // Reply in thread if used from a thread
    unfurl_links: false,
  });

  // Add original as a threaded reply
  const replyThreadTs = threadTs || mainMessage.ts;
  if (replyThreadTs) {
    await slack.chat.postMessage({
      channel: channelId,
      thread_ts: replyThreadTs,
      text: `_Original message:_\n>${originalText}`,
      unfurl_links: false,
    });
  }
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
  // thread_ts is present when the command is used in a thread
  const { text, user_id, channel_id, thread_ts } = payload;

  if (!text || !text.trim()) {
    return new Response(
      JSON.stringify({
        response_type: "ephemeral",
        text: "Please provide a message to trumpify! Usage: `/trumpify your message here`",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // Immediately acknowledge the request (Slack requires response within 3 seconds)
  // Then process asynchronously
  const processAsync = async () => {
    try {
      const trumpified = await trumpifyText(text);
      await postToSlack(channel_id, user_id, text, trumpified, thread_ts);
    } catch (error) {
      console.error("Error processing trumpify request:", error);
      // Try to notify the user of the error
      try {
        const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
        await slack.chat.postEphemeral({
          channel: channel_id,
          user: user_id,
          text: "Sorry, something went wrong while trumpifying your message. Please try again!",
        });
      } catch (e) {
        console.error("Failed to send error message:", e);
      }
    }
  };

  // Start processing without awaiting
  processAsync();

  // Return empty 200 to acknowledge receipt
  return new Response("", { status: 200 });
}

export const config = {
  path: "/api/trumpify",
};
