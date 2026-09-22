CREATE TABLE `shelf_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`visit_id` text NOT NULL,
	`observed_date` text NOT NULL,
	`branch_id` text NOT NULL,
	`product_id` text NOT NULL,
	`remaining_quantity` integer NOT NULL,
	`shelf_not_full` integer DEFAULT false NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_shelf_observations_branch_date` ON `shelf_observations` (`branch_id`,`observed_date`);--> statement-breakpoint
CREATE INDEX `idx_shelf_observations_product_date` ON `shelf_observations` (`product_id`,`observed_date`);--> statement-breakpoint
CREATE INDEX `idx_shelf_observations_visit` ON `shelf_observations` (`visit_id`);