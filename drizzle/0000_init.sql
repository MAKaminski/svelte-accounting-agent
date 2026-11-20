CREATE TABLE `component_states` (
	`component_id` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`config_json` text,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`recommendation_id` text NOT NULL,
	`action` text NOT NULL,
	`final_lines_json` text,
	`final_memo` text,
	`decided_by` text NOT NULL,
	`decided_at` text NOT NULL,
	FOREIGN KEY (`recommendation_id`) REFERENCES `recommendations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `decision_rec_idx` ON `decisions` (`recommendation_id`,`decided_at`);--> statement-breakpoint
CREATE TABLE `dimension_values` (
	`id` text PRIMARY KEY NOT NULL,
	`dimension` text NOT NULL,
	`source` text DEFAULT 'slash' NOT NULL,
	`qbo_account_id` text,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `eval_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`input_json` text NOT NULL,
	`expected_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`kind` text NOT NULL,
	`reference` text,
	`payout_row_id` text,
	`summary` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `ledger_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payout_row_id`) REFERENCES `payout_rows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `evidence_entry_idx` ON `evidence` (`entry_id`);--> statement-breakpoint
CREATE TABLE `ledger_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`credentials_enc` text,
	`capabilities_json` text NOT NULL,
	`bank_feed_confirmed_by` text,
	`bank_feed_confirmed_at` text,
	`last_pull_at` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger_items` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`external_id` text NOT NULL,
	`qbo_txn_id` text,
	`qbo_txn_type` text,
	`ledger_status` text NOT NULL,
	`local_state` text DEFAULT 'fetched' NOT NULL,
	`amount_cents` integer NOT NULL,
	`memo` text,
	`state_reason` text,
	`pending_until` text,
	`raw_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `ledger_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `entries_state_idx` ON `ledger_items` (`local_state`,`created_at`);--> statement-breakpoint
CREATE INDEX `entries_conn_idx` ON `ledger_items` (`connection_id`,`local_state`);--> statement-breakpoint
CREATE UNIQUE INDEX `entries_ext_idx` ON `ledger_items` (`connection_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `ledger_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`kind_hint` text,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`merchant_id` text,
	`merchant_name` text,
	`mcc` text,
	`category_id` text,
	`amount_cents` integer NOT NULL,
	`raw_json` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `ledger_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `ledger_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tx_entry_idx` ON `ledger_transactions` (`item_id`);--> statement-breakpoint
CREATE INDEX `tx_merchant_idx` ON `ledger_transactions` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `local_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`proposal_id` text,
	`source_id` text NOT NULL,
	`value_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `ledger_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_id`) REFERENCES `mapping_proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`value_id`) REFERENCES `dimension_values`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_map_idx` ON `local_mappings` (`connection_id`,`source_id`);--> statement-breakpoint
CREATE TABLE `mapping_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`target` text DEFAULT 'ledger' NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_label` text NOT NULL,
	`dimension` text NOT NULL,
	`value_id` text NOT NULL,
	`support_count` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`applied_at` text,
	FOREIGN KEY (`connection_id`) REFERENCES `ledger_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`value_id`) REFERENCES `dimension_values`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mapping_source_idx` ON `mapping_proposals` (`connection_id`,`source_type`,`source_id`,`dimension`);--> statement-breakpoint
CREATE TABLE `payout_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`payout_id` text NOT NULL,
	`date` text NOT NULL,
	`gross_cents` integer NOT NULL,
	`fees_cents` integer NOT NULL,
	`shipping_cents` integer NOT NULL,
	`net_cents` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qbo_tokens` (
	`realm_id` text PRIMARY KEY NOT NULL,
	`access_token_enc` text NOT NULL,
	`refresh_token_enc` text NOT NULL,
	`expires_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`text` text NOT NULL,
	`best_guess` text,
	`answer` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`answered_at` text,
	FOREIGN KEY (`entry_id`) REFERENCES `ledger_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`run_id` text,
	`primary_value_id` text,
	`action` text NOT NULL,
	`lines_json` text NOT NULL,
	`memo` text NOT NULL,
	`confidence` real NOT NULL,
	`reasoning` text NOT NULL,
	`question` text,
	`prompt_version` text NOT NULL,
	`model` text NOT NULL,
	`input_hash` text NOT NULL,
	`tokens_fresh` integer DEFAULT 0 NOT NULL,
	`tokens_cache_write` integer DEFAULT 0 NOT NULL,
	`tokens_cache_read` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`ttft_ms` integer,
	`e2e_ms` integer,
	`shadow_auto_approve` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `ledger_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`primary_value_id`) REFERENCES `dimension_values`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rec_entry_idx` ON `recommendations` (`entry_id`);--> statement-breakpoint
CREATE INDEX `rec_hash_idx` ON `recommendations` (`input_hash`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`process_id` text NOT NULL,
	`eval_case_id` text,
	`subject_id` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`status` text NOT NULL,
	`error` text,
	`detail_json` text,
	FOREIGN KEY (`eval_case_id`) REFERENCES `eval_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `runs_process_idx` ON `runs` (`process_id`,`started_at`);