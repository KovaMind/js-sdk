# kovamind

[![Tests](https://github.com/KovaMind/js-sdk/actions/workflows/tests.yml/badge.svg)](https://github.com/KovaMind/js-sdk/actions/workflows/tests.yml)

Node.js/TypeScript SDK for the **Kova Mind** memory API — give your AI agents persistent, learning memory.

```bash
npm install kovamind
```

## Quickstart

```typescript
import { KovaMind } from "kovamind";

const kova = new KovaMind({ apiKey: "km_live_xxx" });

// Extract memories from a conversation
const result = await kova.extract({
  conversation: [
    { role: "user", content: "I prefer dark mode and use Python" },
    { role: "assistant", content: "Noted!" },
  ],
  userId: "alex",
});

console.log(`Extracted ${result.patterns.length} patterns`);

// Retrieve relevant memories
const memories = await kova.recall({
  context: "what does alex prefer?",
  userId: "alex",
});

for (const p of memories.patterns) {
  console.log(`${p.pattern} (${(p.confidence * 100).toFixed(0)}%)`);
}

// Score novelty
const novelty = await kova.surprise({
  content: "Alex now prefers light mode",
  userId: "alex",
});
console.log(novelty.score, novelty.route); // 0.82, "contradict"
```

## API

### `new KovaMind(config)`

| Option | Default | Description |
|--------|---------|-------------|
| `apiKey` | required | Your `km_live_...` key |
| `baseUrl` | `https://api.kovamind.io` | API base URL |
| `timeout` | `30000` | Request timeout (ms) |

### `extract(params)` — Extract memory patterns
### `recall(params)` — Retrieve relevant memories
### `surprise(params)` — Score content novelty
### `reinforce(params)` — Confirm/deny a pattern
### `health()` — Check API health

## Error handling

```typescript
import { KovaMind, AuthError, RateLimitError, NotFoundError } from "kovamind";

try {
  const result = await kova.recall({ context: "preferences", userId: "alex" });
} catch (err) {
  if (err instanceof AuthError) {
    console.error("Check your API key");
  } else if (err instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${err.retryAfter}s`);
  } else if (err instanceof NotFoundError) {
    console.error("Resource not found");
  }
}
```

## License

MIT
