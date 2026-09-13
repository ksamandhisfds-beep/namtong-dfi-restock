CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`visit_id` text NOT NULL,
	`shipment_date` text NOT NULL,
	`branch_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_shipments_date` ON `shipments` (`shipment_date`);--> statement-breakpoint
CREATE INDEX `idx_shipments_branch_date` ON `shipments` (`branch_id`,`shipment_date`);--> statement-breakpoint
CREATE INDEX `idx_shipments_product_date` ON `shipments` (`product_id`,`shipment_date`);--> statement-breakpoint
CREATE INDEX `idx_shipments_visit` ON `shipments` (`visit_id`);