CREATE TABLE `component_states` (
	`component_id` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`config_json` text,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
