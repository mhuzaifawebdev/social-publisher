CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"detail" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connect_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"platform" text NOT NULL,
	"kind" text NOT NULL,
	"token_enc" text NOT NULL,
	"refresh_enc" text,
	"token_expires_at" timestamp with time zone,
	"refresh_expires_at" timestamp with time zone,
	"scopes" text,
	"options" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hashtag_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tags" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_clicks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"target_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"referrer" text
);
--> statement-breakpoint
CREATE TABLE "link_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"utm_source" text DEFAULT 'linkedin' NOT NULL,
	"utm_medium" text DEFAULT 'social' NOT NULL,
	"utm_campaign" text DEFAULT '' NOT NULL,
	"track" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_stats" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"target_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"impressions" integer,
	"unique_impressions" integer,
	"reactions" integer,
	"comments" integer,
	"shares" integer,
	"clicks" integer
);
--> statement-breakpoint
CREATE TABLE "post_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"external_id" text,
	"url" text,
	"error" text,
	"link_code" text,
	"qstash_id" text,
	"locked_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"stats_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"link_url" text,
	"link_title" text,
	"image_url" text,
	"template_id" integer,
	"hashtag_set_id" integer,
	"link_set_id" integer,
	"scheduled_at" timestamp with time zone,
	"timezone" text DEFAULT 'Europe/Malta' NOT NULL,
	"rrule" text,
	"series_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"kind" text NOT NULL,
	"external_id" text NOT NULL,
	"urn" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"color" text DEFAULT '#2563eb' NOT NULL,
	"token_enc" text NOT NULL,
	"refresh_enc" text,
	"token_expires_at" timestamp with time zone,
	"refresh_expires_at" timestamp with time zone,
	"scopes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"connected_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stats_daily" (
	"day" date NOT NULL,
	"account_id" integer NOT NULL,
	"posts" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reactions" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"link_clicks" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "stats_daily_day_account_id_pk" PRIMARY KEY("day","account_id")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"image_url" text,
	"link_url" text,
	"hashtag_set_id" integer,
	"link_set_id" integer,
	"account_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rrule" text,
	"time" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connect_sessions" ADD CONSTRAINT "connect_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_clicks" ADD CONSTRAINT "link_clicks_target_id_post_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."post_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_stats" ADD CONSTRAINT "post_stats_target_id_post_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."post_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_hashtag_set_id_hashtag_sets_id_fk" FOREIGN KEY ("hashtag_set_id") REFERENCES "public"."hashtag_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_link_set_id_link_sets_id_fk" FOREIGN KEY ("link_set_id") REFERENCES "public"."link_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_daily" ADD CONSTRAINT "stats_daily_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_hashtag_set_id_hashtag_sets_id_fk" FOREIGN KEY ("hashtag_set_id") REFERENCES "public"."hashtag_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_link_set_id_link_sets_id_fk" FOREIGN KEY ("link_set_id") REFERENCES "public"."link_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "clicks_target_at_idx" ON "link_clicks" USING btree ("target_id","at");--> statement-breakpoint
CREATE INDEX "login_key_at_idx" ON "login_attempts" USING btree ("key","at");--> statement-breakpoint
CREATE INDEX "stats_target_at_idx" ON "post_stats" USING btree ("target_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "targets_post_account_uq" ON "post_targets" USING btree ("post_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "targets_link_code_uq" ON "post_targets" USING btree ("link_code");--> statement-breakpoint
CREATE INDEX "targets_status_time_idx" ON "post_targets" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "targets_account_idx" ON "post_targets" USING btree ("account_id","published_at");--> statement-breakpoint
CREATE INDEX "posts_scheduled_idx" ON "posts" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "posts_status_idx" ON "posts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_platform_urn_uq" ON "social_accounts" USING btree ("platform","urn");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");