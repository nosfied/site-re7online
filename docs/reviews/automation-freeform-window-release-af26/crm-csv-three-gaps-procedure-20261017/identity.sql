BEGIN READ ONLY;
SET LOCAL statement_timeout=5000;
SET LOCAL lock_timeout=1000;
SELECT json_build_object('database',current_database(),'sessionRole',session_user,
 'effectiveRole',current_user,'serverAddress',inet_server_addr(),'serverPort',inet_server_port(),
 'serverVersion',current_setting('server_version_num'),'clusterStart',pg_postmaster_start_time(),
 'transactionReadOnly',current_setting('transaction_read_only'),'databaseOwner',
 (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()));
SELECT json_build_object('systemIdentifier',system_identifier::text) FROM pg_control_system();
SELECT json_build_object('scope','public application tables','relations',coalesce(json_agg(
 json_build_object('schema',n.nspname,'relation',c.relname,'owner',pg_get_userbyid(c.relowner),
 'selectAllowed',has_table_privilege(current_user,c.oid,'SELECT')) ORDER BY c.relname),'[]'::json))
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname IN
 ('Event','Client','Conversation','Contact','Message','ScheduledMessage');
SELECT json_build_object('allClientBackendsVisible',pg_has_role(current_user,'pg_read_all_stats','MEMBER')
 OR (SELECT rolsuper FROM pg_roles WHERE rolname=current_user),
 'roleSuperuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user));
ROLLBACK;
