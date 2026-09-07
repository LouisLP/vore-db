CREATE TYPE "public"."name_kind" AS ENUM('native', 'romanisation', 'synonym', 'historical');--> statement-breakpoint
CREATE TYPE "public"."origin_role" AS ENUM('origin', 'national_dish', 'popular_in');--> statement-breakpoint
CREATE TABLE "category" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "category_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_slug_uq" UNIQUE("slug"),
	CONSTRAINT "category_slug_format" CHECK ("category"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "category_parent_not_self" CHECK ("category"."parent_id" is null or "category"."parent_id" <> "category"."id")
);
--> statement-breakpoint
CREATE TABLE "country" (
	"code" char(2) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "country_name_uq" UNIQUE("name"),
	CONSTRAINT "country_code_upper" CHECK ("country"."code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "item" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "item_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_slug_uq" UNIQUE("slug"),
	CONSTRAINT "item_slug_format" CHECK ("item"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "item_name_not_blank" CHECK (length(btrim("item"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "item_country" (
	"item_id" integer NOT NULL,
	"country_code" char(2) NOT NULL,
	"role" "origin_role" NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "item_country_item_id_country_code_role_pk" PRIMARY KEY("item_id","country_code","role"),
	CONSTRAINT "item_country_primary_is_origin" CHECK (not "item_country"."is_primary" or "item_country"."role" = 'origin')
);
--> statement-breakpoint
CREATE TABLE "item_image" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "item_image_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"url" text NOT NULL,
	"alt_text" text NOT NULL,
	"position" integer NOT NULL,
	"caption" text,
	"licence_code" text,
	"attribution" text,
	"source_page_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_image_position_uq" UNIQUE("item_id","position"),
	CONSTRAINT "item_image_url_uq" UNIQUE("item_id","url"),
	CONSTRAINT "item_image_position_nonneg" CHECK ("item_image"."position" >= 0),
	CONSTRAINT "item_image_alt_text_not_blank" CHECK (length(btrim("item_image"."alt_text")) > 0)
);
--> statement-breakpoint
CREATE TABLE "item_name" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "item_name_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_id" integer NOT NULL,
	"value" text NOT NULL,
	"kind" "name_kind" NOT NULL,
	"lang" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_name_value_not_blank" CHECK (length(btrim("item_name"."value")) > 0),
	CONSTRAINT "item_name_lang_bcp47" CHECK ("item_name"."lang" is null or "item_name"."lang" ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$')
);
--> statement-breakpoint
CREATE TABLE "item_tag" (
	"item_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "item_tag_item_id_tag_id_pk" PRIMARY KEY("item_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "media_licence" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"requires_attribution" boolean NOT NULL,
	CONSTRAINT "media_licence_code_format" CHECK ("media_licence"."code" ~ '^[A-Za-z0-9][A-Za-z0-9.-]*$')
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tag_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"group_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_slug_uq" UNIQUE("slug"),
	CONSTRAINT "tag_slug_format" CHECK ("tag"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "tag_group" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tag_group_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_group_slug_uq" UNIQUE("slug"),
	CONSTRAINT "tag_group_slug_format" CHECK ("tag_group"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_country" ADD CONSTRAINT "item_country_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_country" ADD CONSTRAINT "item_country_country_code_country_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."country"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_image" ADD CONSTRAINT "item_image_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_image" ADD CONSTRAINT "item_image_licence_code_media_licence_code_fk" FOREIGN KEY ("licence_code") REFERENCES "public"."media_licence"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_name" ADD CONSTRAINT "item_name_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tag" ADD CONSTRAINT "item_tag_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tag" ADD CONSTRAINT "item_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_group_id_tag_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."tag_group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_parent_idx" ON "category" USING btree ("parent_id") WHERE "category"."parent_id" is not null;--> statement-breakpoint
CREATE INDEX "item_category_idx" ON "item" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_country_one_primary_uq" ON "item_country" USING btree ("item_id") WHERE "item_country"."is_primary";--> statement-breakpoint
CREATE INDEX "item_country_country_idx" ON "item_country" USING btree ("country_code","role");--> statement-breakpoint
CREATE UNIQUE INDEX "item_name_value_uq" ON "item_name" USING btree ("item_id",lower("value"));--> statement-breakpoint
CREATE INDEX "item_name_lower_value_idx" ON "item_name" USING btree (lower("value"));--> statement-breakpoint
CREATE INDEX "item_tag_tag_idx" ON "item_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tag_group_idx" ON "tag" USING btree ("group_id");