CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kcal` real NOT NULL,
	`protein_g` real,
	`carbs_g` real,
	`fat_g` real,
	`fibre_g` real,
	`quantity` real DEFAULT 1 NOT NULL,
	`meal_type` text,
	`notes` text,
	`eaten_at` text NOT NULL,
	`eaten_local_date` text NOT NULL,
	`logged_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`version` integer,
	`dirty` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entries_day` ON `entries` (`eaten_local_date`);--> statement-breakpoint
CREATE TABLE `profile` (
	`id` text PRIMARY KEY NOT NULL,
	`sex` text NOT NULL,
	`birth_year` integer NOT NULL,
	`height_cm` real NOT NULL,
	`weight_kg` real NOT NULL,
	`body_fat_percent` real,
	`activity_level` text NOT NULL,
	`goal_kg_per_week` real NOT NULL,
	`target_kcal` real,
	`target_protein_g` real,
	`target_carbs_g` real,
	`target_fat_g` real,
	`target_fibre_g` real,
	`updated_at` text NOT NULL,
	`version` integer,
	`dirty` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
