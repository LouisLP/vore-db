-- Hand-written. Three rules the Drizzle schema cannot express, plus one constraint that
-- has to be made deferrable after the fact. Generated with `drizzle-kit generate --custom`,
-- so it sits in the journal like any other migration and drizzle-kit will not touch it.
--
-- Written for readability at psql: functions are `create or replace`, triggers are dropped
-- first, so re-running the file by hand is harmless.


-- ---------------------------------------------------------------------------
-- 1. ADR-0002 — every item has at least one country with role = 'origin'.
--
-- A deferred constraint trigger, checked at COMMIT. That is what makes inserting an item
-- and its countries in one transaction possible at all: a CHECK cannot see another table,
-- and an immediate trigger would reject the item row before its countries exist.
--
-- Note the rule wants an `origin` row specifically. An item carrying only `popular_in`
-- rows — pizza tagged to the United States and nowhere else — fails at COMMIT, which is
-- correct: it still owes its Italy row.
-- ---------------------------------------------------------------------------

CREATE FUNCTION item_requires_origin() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_item_id integer;
  target_slug    text;
BEGIN
  -- Fired from three places: an item insert, and an item_country update or delete.
  IF tg_table_name = 'item' THEN
    target_item_id := new.id;
  ELSIF tg_op = 'DELETE' THEN
    target_item_id := old.item_id;
  ELSE
    target_item_id := new.item_id;
  END IF;

  -- Deleting an item cascades to its item_country rows and fires this trigger on the way
  -- out. The item is gone, so there is nothing left to be wrong about.
  SELECT slug INTO target_slug FROM item WHERE id = target_item_id;
  IF NOT found THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM item_country
    WHERE item_id = target_item_id AND role = 'origin'
  ) THEN
    RAISE EXCEPTION
      'item "%" (id %) has no country with role ''origin''', target_slug, target_item_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER item_requires_origin_on_item
  AFTER INSERT ON item
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION item_requires_origin();
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER item_requires_origin_on_item_country
  AFTER UPDATE OR DELETE ON item_country
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION item_requires_origin();
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 2. ADR-0004 — an alias never restates its item's own canonical name.
--
-- Two triggers for one rule, because the restatement can arrive from either side: a new
-- alias, or a rename of the item. Both fire immediately rather than at COMMIT — unlike the
-- origin rule, this one only needs the `item` row, which the foreign key already
-- guarantees exists.
--
-- Comparison is `lower(btrim(...))`, matching the case-insensitive uniqueness the
-- `item_name_value_uq` expression index already imposes within an item.
-- ---------------------------------------------------------------------------

CREATE FUNCTION item_name_not_restatement() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF tg_table_name = 'item_name' THEN
    IF EXISTS (
      SELECT 1 FROM item
      WHERE id = new.item_id
        AND lower(btrim(name)) = lower(btrim(new.value))
    ) THEN
      RAISE EXCEPTION
        'alias "%" restates the name of item %', new.value, new.item_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM item_name
      WHERE item_id = new.id
        AND lower(btrim(value)) = lower(btrim(new.name))
    ) THEN
      RAISE EXCEPTION
        'item "%" is being renamed to "%", which is already one of its aliases',
        new.slug, new.name
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER item_name_not_restatement_on_item_name
  AFTER INSERT OR UPDATE ON item_name
  FOR EACH ROW EXECUTE FUNCTION item_name_not_restatement();
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER item_name_not_restatement_on_item
  AFTER UPDATE OF name ON item
  FOR EACH ROW EXECUTE FUNCTION item_name_not_restatement();
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 3. `updated_at` maintenance.
--
-- The column has a default, which only covers the insert. This makes it true on every
-- write regardless of who does the writing — the seed script, psql, a future API.
-- Only on the tables that carry audit columns; reference and join tables have none.
-- ---------------------------------------------------------------------------

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER category_set_updated_at   BEFORE UPDATE ON category   FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER tag_group_set_updated_at  BEFORE UPDATE ON tag_group  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER tag_set_updated_at        BEFORE UPDATE ON tag        FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER item_set_updated_at       BEFORE UPDATE ON item       FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER item_name_set_updated_at  BEFORE UPDATE ON item_name  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER item_image_set_updated_at BEFORE UPDATE ON item_image FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 4. ADR-0005 — make the image ordering constraint deferrable.
--
-- Reordering an item's images is a sequence of UPDATEs that is momentarily in conflict.
-- INITIALLY IMMEDIATE, so ordinary writes behave exactly as before; a reordering
-- transaction opts in with `SET CONSTRAINTS item_image_position_uq DEFERRED`.
--
-- It has to be dropped and re-added: `ALTER TABLE … ALTER CONSTRAINT` only accepts
-- foreign keys ("constraint … is not a foreign key constraint" — verified against 18.1).
-- The name is unchanged, so drizzle-kit's snapshot still matches and no future `generate`
-- notices. Deferrability itself is not recorded in that snapshot, which cuts both ways:
-- this survives, but it is not re-emitted if the constraint is ever recreated.
--
-- The cost: a deferrable unique constraint cannot be used to infer an `ON CONFLICT`
-- target, so upserting an image by `(item_id, position)` is off the table. Nothing wants
-- to — images are written whole, and `(item_id, url)` is still available for inference.
-- ---------------------------------------------------------------------------

ALTER TABLE item_image
  DROP CONSTRAINT item_image_position_uq,
  ADD CONSTRAINT item_image_position_uq UNIQUE (item_id, "position")
    DEFERRABLE INITIALLY IMMEDIATE;
