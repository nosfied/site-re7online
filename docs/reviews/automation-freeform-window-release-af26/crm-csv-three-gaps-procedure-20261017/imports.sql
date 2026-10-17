BEGIN READ ONLY; SET LOCAL statement_timeout=15000;
WITH e AS (SELECT "id","clientId","requestId","eventName","payloadJson" FROM "Event"
 WHERE "eventName" LIKE 'crm.contact.import.%' OR
 ("eventName"='crm.contact.created' AND "payloadJson"->>'source'='crm_import')),
limited AS (SELECT * FROM e ORDER BY "id" LIMIT 100001)
SELECT json_build_object('rows',coalesce(json_agg(json_build_object(
 'id',"id",'tenant',"clientId",'request',"requestId",'event',"eventName",
 'status',"payloadJson"->>'status','operation',"payloadJson"->>'operationId')),'[]'::json)) FROM limited;
ROLLBACK;