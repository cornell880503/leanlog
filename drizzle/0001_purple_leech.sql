CREATE TABLE `body_scans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` date NOT NULL,
	`time` varchar(8),
	`device` varchar(32) NOT NULL DEFAULT 'Boditrax',
	`location` varchar(128),
	`weightKg` double NOT NULL,
	`fatMassKg` double NOT NULL,
	`ffmKg` double NOT NULL,
	`muscleMassKg` double,
	`waterKg` double,
	`ecwKg` double,
	`icwKg` double,
	`visceralFat` double,
	`cellularIntegrity` double,
	`metabolicAge` double,
	`physiqueScore` double,
	`legMuscleScore` double,
	`bmrScore` double,
	`boditraxScore` double,
	`muscleCore` double,
	`muscleLArm` double,
	`muscleRArm` double,
	`muscleLLeg` double,
	`muscleRLeg` double,
	`fatCore` double,
	`fatLArm` double,
	`fatRArm` double,
	`fatLLeg` double,
	`fatRLeg` double,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `body_scans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `body_weights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` date NOT NULL,
	`weightKg` double NOT NULL,
	`fasted` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `body_weights_id` PRIMARY KEY(`id`),
	CONSTRAINT `weights_user_date` UNIQUE(`userId`,`date`)
);
--> statement-breakpoint
CREATE TABLE `custom_exercises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`days` json NOT NULL,
	`primaryMuscles` json NOT NULL,
	`secondaryMuscles` json NOT NULL,
	`equipment` varchar(16) NOT NULL,
	`category` varchar(16) NOT NULL,
	`unit` varchar(8) NOT NULL DEFAULT 'reps',
	`bwFactor` double NOT NULL DEFAULT 0,
	`archived` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `custom_exercises_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jump_tests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` date NOT NULL,
	`standingReachCm` double,
	`approachReachCm` double NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `jump_tests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clientId` varchar(64) NOT NULL,
	`date` date NOT NULL,
	`type` varchar(16) NOT NULL,
	`startedAt` timestamp,
	`endedAt` timestamp,
	`durationMin` int,
	`srpe` int,
	`jumps` int NOT NULL DEFAULT 0,
	`vbKind` varchar(16),
	`kneeStatus` varchar(16),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_user_client` UNIQUE(`userId`,`clientId`)
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`userId` int NOT NULL,
	`standingReachCm` double NOT NULL DEFAULT 238,
	`standingReachEstimated` boolean NOT NULL DEFAULT true,
	`settings` json NOT NULL,
	`baselineVersion` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_settings_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `workout_sets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`userId` int NOT NULL,
	`exerciseKey` varchar(64) NOT NULL,
	`exerciseOrder` int NOT NULL,
	`setNo` int NOT NULL,
	`weightKg` double NOT NULL DEFAULT 0,
	`reps` int NOT NULL,
	`rpe` double,
	`isWarmup` boolean NOT NULL DEFAULT false,
	`bodyweightKg` double,
	CONSTRAINT `workout_sets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `scans_user_date` ON `body_scans` (`userId`,`date`);--> statement-breakpoint
CREATE INDEX `jumps_user_date` ON `jump_tests` (`userId`,`date`);--> statement-breakpoint
CREATE INDEX `sessions_user_date` ON `sessions` (`userId`,`date`);--> statement-breakpoint
CREATE INDEX `sets_session` ON `workout_sets` (`sessionId`);--> statement-breakpoint
CREATE INDEX `sets_user_exercise` ON `workout_sets` (`userId`,`exerciseKey`);