CREATE TABLE "api_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" text,
	"revoked_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject" text,
	"detail_json" text,
	"at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "component_states" (
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"component_id" text NOT NULL,
	"enabled" boolean NOT NULL,
	"config_json" text,
	"updated_by" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "component_states_org_id_component_id_pk" PRIMARY KEY("org_id","component_id")
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"recommendation_id" text NOT NULL,
	"action" text NOT NULL,
	"final_lines_json" text,
	"final_memo" text,
	"decided_by" text NOT NULL,
	"decided_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dimension_values" (
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"id" text NOT NULL,
	"dimension" text NOT NULL,
	"source" text DEFAULT 'slash' NOT NULL,
	"qbo_account_id" text,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "dimension_values_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "eval_cases" (
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"input_json" text NOT NULL,
	"expected_json" text NOT NULL,
	CONSTRAINT "eval_cases_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"entry_id" text NOT NULL,
	"kind" text NOT NULL,
	"reference" text,
	"payout_row_id" text,
	"summary" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"invited_by" text,
	"created_at" text NOT NULL,
	"accepted_at" text
);
--> statement-breakpoint
CREATE TABLE "ledger_connections" (
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"config_json" text DEFAULT '{}' NOT NULL,
	"credentials_enc" text,
	"capabilities_json" text NOT NULL,
	"bank_feed_confirmed_by" text,
	"bank_feed_confirmed_at" text,
	"last_pull_at" text,
	"last_error" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "ledger_connections_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "ledger_items" (
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"id" text NOT NULL,
	"connection_id" text NOT NULL,
	"external_id" text NOT NULL,
	"qbo_txn_id" text,
	"qbo_txn_type" text,
	"ledger_status" text NOT NULL,
	"local_state" text DEFAULT 'fetched' NOT NULL,
	"amount_cents" integer NOT NULL,
	"memo" text,
	"state_reason" text,
	"pending_until" text,
	"raw_json" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "ledger_items_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"id" text NOT NULL,
	"item_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"kind_hint" text,
	"date" text NOT NULL,
	"description" text NOT NULL,
	"merchant_id" text,
	"merchant_name" text,
	"mcc" text,
	"category_id" text,
	"amount_cents" integer NOT NULL,
	"raw_json" text NOT NULL,
	CONSTRAINT "ledger_transactions_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "local_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"connection_id" text NOT NULL,
	"proposal_id" text,
	"source_id" text NOT NULL,
	"value_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mapping_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"connection_id" text NOT NULL,
	"target" text DEFAULT 'ledger' NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_label" text NOT NULL,
	"dimension" text NOT NULL,
	"value_id" text NOT NULL,
	"support_count" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" text NOT NULL,
	"applied_at" text
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_rows" (
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"id" text NOT NULL,
	"channel" text NOT NULL,
	"payout_id" text NOT NULL,
	"date" text NOT NULL,
	"gross_cents" integer NOT NULL,
	"fees_cents" integer NOT NULL,
	"shipping_cents" integer NOT NULL,
	"net_cents" integer NOT NULL,
	CONSTRAINT "payout_rows_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "qbo_tokens" (
	"org_id" text PRIMARY KEY DEFAULT current_setting('app.org_id', true) NOT NULL,
	"realm_id" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"expires_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"entry_id" text NOT NULL,
	"text" text NOT NULL,
	"best_guess" text,
	"answer" text,
	"status" text NOT NULL,
	"created_at" text NOT NULL,
	"answered_at" text
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"entry_id" text NOT NULL,
	"run_id" text,
	"primary_value_id" text,
	"action" text NOT NULL,
	"lines_json" text NOT NULL,
	"memo" text NOT NULL,
	"confidence" double precision NOT NULL,
	"reasoning" text NOT NULL,
	"question" text,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"input_hash" text NOT NULL,
	"tokens_fresh" integer DEFAULT 0 NOT NULL,
	"tokens_cache_write" integer DEFAULT 0 NOT NULL,
	"tokens_cache_read" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"ttft_ms" integer,
	"e2e_ms" integer,
	"shadow_auto_approve" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT current_setting('app.org_id', true) NOT NULL,
	"process_id" text NOT NULL,
	"eval_case_id" text,
	"subject_id" text,
	"started_at" text NOT NULL,
	"ended_at" text,
	"status" text NOT NULL,
	"error" text,
	"detail_json" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"google_sub" text,
	"last_seen_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_states" ADD CONSTRAINT "component_states_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_values" ADD CONSTRAINT "dimension_values_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_org_id_entry_id_ledger_items_org_id_id_fk" FOREIGN KEY ("org_id","entry_id") REFERENCES "public"."ledger_items"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_org_id_payout_row_id_payout_rows_org_id_id_fk" FOREIGN KEY ("org_id","payout_row_id") REFERENCES "public"."payout_rows"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_connections" ADD CONSTRAINT "ledger_connections_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_items" ADD CONSTRAINT "ledger_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_items" ADD CONSTRAINT "ledger_items_org_id_connection_id_ledger_connections_org_id_id_fk" FOREIGN KEY ("org_id","connection_id") REFERENCES "public"."ledger_connections"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_org_id_item_id_ledger_items_org_id_id_fk" FOREIGN KEY ("org_id","item_id") REFERENCES "public"."ledger_items"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_org_id_connection_id_ledger_connections_org_id_id_fk" FOREIGN KEY ("org_id","connection_id") REFERENCES "public"."ledger_connections"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_mappings" ADD CONSTRAINT "local_mappings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_mappings" ADD CONSTRAINT "local_mappings_proposal_id_mapping_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."mapping_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_mappings" ADD CONSTRAINT "local_mappings_org_id_connection_id_ledger_connections_org_id_id_fk" FOREIGN KEY ("org_id","connection_id") REFERENCES "public"."ledger_connections"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_mappings" ADD CONSTRAINT "local_mappings_org_id_value_id_dimension_values_org_id_id_fk" FOREIGN KEY ("org_id","value_id") REFERENCES "public"."dimension_values"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_proposals" ADD CONSTRAINT "mapping_proposals_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_proposals" ADD CONSTRAINT "mapping_proposals_org_id_connection_id_ledger_connections_org_id_id_fk" FOREIGN KEY ("org_id","connection_id") REFERENCES "public"."ledger_connections"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_proposals" ADD CONSTRAINT "mapping_proposals_org_id_value_id_dimension_values_org_id_id_fk" FOREIGN KEY ("org_id","value_id") REFERENCES "public"."dimension_values"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_rows" ADD CONSTRAINT "payout_rows_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qbo_tokens" ADD CONSTRAINT "qbo_tokens_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_org_id_entry_id_ledger_items_org_id_id_fk" FOREIGN KEY ("org_id","entry_id") REFERENCES "public"."ledger_items"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_org_id_entry_id_ledger_items_org_id_id_fk" FOREIGN KEY ("org_id","entry_id") REFERENCES "public"."ledger_items"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_org_id_primary_value_id_dimension_values_org_id_id_fk" FOREIGN KEY ("org_id","primary_value_id") REFERENCES "public"."dimension_values"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_org_id_eval_case_id_eval_cases_org_id_id_fk" FOREIGN KEY ("org_id","eval_case_id") REFERENCES "public"."eval_cases"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_token_hash_idx" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "audit_org_at_idx" ON "audit_log" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "decision_rec_idx" ON "decisions" USING btree ("recommendation_id","decided_at");--> statement-breakpoint
CREATE INDEX "evidence_entry_idx" ON "evidence" USING btree ("org_id","entry_id");--> statement-breakpoint
CREATE INDEX "invites_email_idx" ON "invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "entries_state_idx" ON "ledger_items" USING btree ("org_id","local_state","created_at");--> statement-breakpoint
CREATE INDEX "entries_conn_idx" ON "ledger_items" USING btree ("org_id","connection_id","local_state");--> statement-breakpoint
CREATE UNIQUE INDEX "entries_ext_idx" ON "ledger_items" USING btree ("org_id","connection_id","external_id");--> statement-breakpoint
CREATE INDEX "tx_entry_idx" ON "ledger_transactions" USING btree ("org_id","item_id");--> statement-breakpoint
CREATE INDEX "tx_merchant_idx" ON "ledger_transactions" USING btree ("org_id","merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "local_map_idx" ON "local_mappings" USING btree ("org_id","connection_id","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mapping_source_idx" ON "mapping_proposals" USING btree ("org_id","connection_id","source_type","source_id","dimension");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_org_user_idx" ON "memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "rec_entry_idx" ON "recommendations" USING btree ("org_id","entry_id");--> statement-breakpoint
CREATE INDEX "rec_hash_idx" ON "recommendations" USING btree ("org_id","input_hash");--> statement-breakpoint
CREATE INDEX "runs_process_idx" ON "runs" USING btree ("org_id","process_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");