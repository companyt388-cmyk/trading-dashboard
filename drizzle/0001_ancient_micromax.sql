CREATE TABLE `accuracyTracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pair` varchar(20) NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`predictionId` int NOT NULL,
	`predictedSignal` enum('UP','DOWN','NO_TRADE') NOT NULL,
	`actualSignal` enum('UP','DOWN','NEUTRAL'),
	`isCorrect` int,
	`confidence` decimal(5,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `accuracyTracking_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `candles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pair` varchar(20) NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`timestamp` timestamp NOT NULL,
	`open` decimal(20,8) NOT NULL,
	`high` decimal(20,8) NOT NULL,
	`low` decimal(20,8) NOT NULL,
	`close` decimal(20,8) NOT NULL,
	`volume` decimal(20,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `candles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patternHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pair` varchar(20) NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`patternType` varchar(50) NOT NULL,
	`candleTimestamp` timestamp NOT NULL,
	`strength` decimal(5,2) NOT NULL,
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `patternHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pair` varchar(20) NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`candleTimestamp` timestamp NOT NULL,
	`signal` enum('UP','DOWN','NO_TRADE') NOT NULL,
	`confidence` decimal(5,2) NOT NULL,
	`score` decimal(5,2) NOT NULL,
	`trickScores` json NOT NULL,
	`multiTimeframeConfirm` int DEFAULT 0,
	`emaMatch` int DEFAULT 0,
	`volumeConfirm` int DEFAULT 0,
	`liquidityTrapDetect` int DEFAULT 0,
	`entrySignal` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `predictions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supportResistance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pair` varchar(20) NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`level` decimal(20,8) NOT NULL,
	`type` enum('SUPPORT','RESISTANCE') NOT NULL,
	`strength` decimal(5,2) NOT NULL,
	`touches` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supportResistance_id` PRIMARY KEY(`id`)
);
