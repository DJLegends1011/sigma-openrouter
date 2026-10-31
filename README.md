# OpenRouter for Project Σ (`openrouter`)

> **Status:** `v1.0.0-beta` — Beta release for Project Σ frontend & extension testing.

Adds **OpenRouter** (`https://openrouter.ai/api/v1`) as a native connection kind in Project Σ (`ctx.llm.registerAdapter`), alongside the built-in OpenAI-compatible and Anthropic adapters.

## Features

- **Zero-Config Endpoint**: Select **OpenRouter** as your connection kind in **Settings > AI**, paste your `sk-or-...` API key, and browse/select from all 450+ OpenRouter models without entering a custom base URL.
- **Model Metadata & Vision Detection**: Reads `context_length` / `top_provider.context_length` and `architecture.input_modalities` from OpenRouter's `/models` catalog so Project Σ knows each model's context window and image/vision support automatically.
- **Unified Reasoning (`reasoning`)**: Translates Project Σ's `low` / `medium` / `high` reasoning effort into OpenRouter's normalized `reasoning: { effort }` object (supporting Claude, DeepSeek R1, Gemini Thinking, OpenAI o-series, QwQ, etc.) and streams thoughts into Project Σ's collapsible **Thinking** fold (`delta.reasoning`, `reasoning_content`, and `reasoning_details`).
- **Upstream Error Unwrapping & Retry Classification**: Unwraps OpenRouter's nested `{ error: { code, message, metadata: { provider_name, raw } } }` payloads (including HTTP 200 in-body errors and mid-SSE stream errors) so rate limits (`429`), quota/credit errors (`402`), auth failures (`401`/`403`), and retryable upstream errors (`502`/`503`) surface clearly with the real upstream provider message.
- **Provider Routing Controls**: Configure OpenRouter's `provider` routing object directly from **Settings > Extensions > OpenRouter**:
  - **Sort providers by**: Default (balanced), `price` (lowest cost), `throughput` (fastest tokens/sec), or `latency` (lowest TTFT).
  - **Preferred providers (`order`)**: Comma-separated provider slugs to try first (e.g. `anthropic, google-vertex, fireworks`).
  - **Ignored providers (`ignore`)**: Comma-separated provider slugs to exclude (e.g. `deepinfra, together`).
  - **Allow backup providers (`allow_fallbacks`)**: Toggle fallback routing if preferred providers are down or rate-limited.
  - **Data collection policy (`data_collection`)**: `allow` all providers or `deny` providers that log/train on prompts.
  - **Zero Data Retention (`zdr`)**: Restrict routing exclusively to ZDR endpoints.

## Installation

### From a `.zip` Archive or Folder
1. In Project Σ, open **Settings > Extensions** and upload `openrouter.zip` (or copy the `openrouter` folder into `extensions/installed/openrouter/`).
2. Restart the Project Σ server so the backend adapter mounts, then toggle **OpenRouter** on in **Settings > Extensions**.

### From Git
1. In **Settings > Extensions**, install from `https://github.com/DJLegends1011/sigma-openrouter.git` (or clone into `extensions/installed/openrouter`).
2. Restart the Project Σ server and switch **OpenRouter** on.

## Using It

1. Go to **Settings > AI** and click **Add Connection** (or edit an existing one).
2. Set **Kind** to **OpenRouter**.
3. Paste your OpenRouter API key (`sk-or-...`), pick a model from the list, and run **Test** (and **Check** for vision models).
4. *(Optional)* Adjust **Reasoning effort** (`low`, `medium`, `high`) on the connection or tweak provider routing in **Settings > Extensions > OpenRouter**.
