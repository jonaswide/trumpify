# Trumpify Slack App

A Slack slash command that rewrites messages in Trump's distinctive speaking style.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click "Create New App"
2. Choose "From scratch"
3. Name it "Trumpify" and select your workspace

### 3. Configure the Slack App

#### Bot Token Scopes
Go to **OAuth & Permissions** and add these Bot Token Scopes:
- `chat:write` - Post messages
- `users:read` - Get user display names
- `commands` - Handle slash commands

#### Install to Workspace
Click "Install to Workspace" and authorize. Copy the **Bot User OAuth Token** (starts with `xoxb-`).

#### Get Signing Secret
Go to **Basic Information** and copy the **Signing Secret**.

### 4. Deploy to Netlify

```bash
# Login to Netlify (first time only)
npx netlify login

# Create new site
npx netlify init

# Set environment variables
npx netlify env:set SLACK_BOT_TOKEN "xoxb-your-token"
npx netlify env:set SLACK_SIGNING_SECRET "your-signing-secret"
npx netlify env:set MISTRAL_API_KEY "your-mistral-key"

# Deploy
npm run deploy
```

Note your Netlify URL (e.g., `https://your-site.netlify.app`).

### 5. Create the Slash Command

1. In your Slack App settings, go to **Slash Commands**
2. Click "Create New Command"
3. Configure:
   - **Command:** `/trumpify`
   - **Request URL:** `https://your-site.netlify.app/api/trumpify`
   - **Short Description:** Rewrite a message in Trump's speaking style
   - **Usage Hint:** `[your message]`
4. Save

### 6. Reinstall the App

After adding the slash command, go to **Install App** and click "Reinstall to Workspace".

## Usage

In any Slack channel where the bot is present:

```
/trumpify I still plan to show up, but DSB is almost bound to fuck it up between pending snowstorm and their notice
```

The bot will post the trumpified message publicly and add the original as a threaded reply.

## Local Development

```bash
# Create .env file with your credentials
cp .env.example .env
# Edit .env with your actual values

# Run locally with Netlify Dev (includes ngrok tunnel)
npm run dev
```

## Get a Mistral API Key

1. Go to [console.mistral.ai](https://console.mistral.ai/)
2. Create an account or sign in
3. Go to API Keys and create a new key
