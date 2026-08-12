# @kovamind/js-sdk

[![Tests](https://github.com/KovaMind/js-sdk/actions/workflows/tests.yml/badge.svg)](https://github.com/KovaMind/js-sdk/actions/workflows/tests.yml)

Node.js/TypeScript SDK for the **Kova Mind** memory API — give your AI agents persistent, learning memory.

```bash
npm install @kovamind/js-sdk
```

## Quickstart

```typescript
import { KovaMind } from "@kovamind/js-sdk";

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

// Reinforce a pattern — type is "confirmed", "contradicted", or "used"
const reinforced = await kova.reinforce({
  patternId: memories.patterns[0].id,
  reinforcementType: "confirmed",
});
console.log(
  `confidence ${reinforced.previousConfidence} -> ${reinforced.newConfidence}`
); // e.g. "confidence 0.75 -> 0.85"
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

`minConfidence` is optional. When you omit it the SDK does not send the field,
so the server's default minimum confidence (`0.1`) applies. Pass a value only
when you want a stricter filter.
### `surprise(params)` — Score content novelty
### `reinforce(params)` — Reinforce a pattern (`"confirmed"` | `"contradicted"` | `"used"`); returns the pattern's previous/new confidence
### `health()` — Check API health

## Error handling

```typescript
import { KovaMind, AuthError, RateLimitError, NotFoundError } from "@kovamind/js-sdk";

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

## Bound API keys (403 — identity mismatch)

An API key can be **bound server-side to a single `user_id`** (a fixed agent
identity). This is a Kova Mind server feature and applies regardless of which
SDK you use.

- **Bound key:** if the `userId` you pass in a request differs from the identity
  the key is bound to, the API rejects the request with:

  ```
  HTTP 403  {"detail": "API key is bound to a different agent identity"}
  ```

- **Unbound key:** the client-supplied `userId` is passed through unchanged
  (no binding check).

This is a new documented failure mode integrators must handle. The SDK surfaces
it as a `KovaMindError` with `statusCode === 403` and the server's `detail`
string as the message:

```typescript
import { KovaMind, KovaMindError } from "@kovamind/js-sdk";

try {
  await kova.recall({ context: "preferences", userId: "alex" });
} catch (err) {
  if (err instanceof KovaMindError && err.statusCode === 403) {
    // The key is bound to a different user_id than the one you sent.
    // Use the user_id this key is bound to, or use an unbound key.
    console.error(err.message); // "API key is bound to a different agent identity"
  }
}
```

> Tip: give each agent its own bound key so a key can only ever read and write
> that agent's memories.

## License

MIT
