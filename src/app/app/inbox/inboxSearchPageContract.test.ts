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

test("the complete query key is scoped to authenticated tenant, user and token", () => {
  const keyStart = source.indexOf("const conversationQueryKey = useMemo");
  const keyEnd = source.indexOf("conversationQueryRegistryRef.current.setCurrentKey", keyStart);
  const keyBlock = source.slice(keyStart, keyEnd);
  assert.match(keyBlock, /clientId: session\.user\.clientId/);
  assert.match(keyBlock, /userId: session\.user\.id/);
  assert.match(keyBlock, /token: session\.token/);
});

test("filter transitions preserve eligible composition and use the behavioral timeline gate", () => {
  const clearStart = source.indexOf("const clearSelectedConversation = useCallback");
  const clearEnd = source.indexOf("}, [abortSelectedTimelineRequest]", clearStart);
  const clearBlock = source.slice(clearStart, clearEnd);
  assert.match(clearBlock, /abortSelectedTimelineRequest\(\)/);
  assert.match(clearBlock, /detailRequestSeqRef\.current \+= 1/);
  assert.match(clearBlock, /setSelectedConversationKey\(null\)/);
  assert.match(clearBlock, /setMessages\(\[\]\)/);

  const filterStart = source.indexOf("const applyConversationFilter = useCallback");
  const filterEnd = source.indexOf("const canReply = useMemo", filterStart);
  const filterBlock = source.slice(filterStart, filterEnd);
  assert.match(filterBlock, /decideInboxFilterTransition/);
  assert.match(filterBlock, /selectionMatchesNextFilter/);
  assert.match(filterBlock, /if \(decision === "clear"\)/);
  assert.match(source, /shouldPublishInboxTimelineResponse/);
  assert.match(source, /Esta conversa está fora do filtro atual e foi mantida para preservar seu rascunho ou anexo/);
});

