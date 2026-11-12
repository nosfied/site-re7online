import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("inbox search uses query-scoped requests and does not clear the valid list before refresh", () => {
  assert.match(source, /conversationQueryRegistryRef\.current\.run\(requestQueryKey/);
  assert.match(source, /isCurrent\(requestQueryKey\)/);
  const queryEffect = source.slice(source.indexOf("useEffect(() => {\n    if (!session) return;", source.indexOf("setLoadingConversations(true)")));
  assert.doesNotMatch(queryEffect.slice(0, queryEffect.indexOf("}, [conversationQueryKey")), /setConversations\(\[\]\)/);
});

test("remote results are not filtered again by the raw search term", () => {
  const start = source.indexOf("const filteredConversations = useMemo");
  const end = source.indexOf("useEffect(() =>", start);
  const block = source.slice(start, end);
  assert.doesNotMatch(block, /conversationSearch/);
  assert.doesNotMatch(block, /lastMessage\?\.bodyText/);
});

test("search input is debounced independently while clear remains an immediate zero-delay query", () => {
  assert.match(source, /normalized \? INBOX_CONVERSATION_SEARCH_DEBOUNCE_MS : 0/);
  assert.match(source, /value=\{conversationSearchInput\}/);
  assert.match(source, /search: search \|\| null/);
});

