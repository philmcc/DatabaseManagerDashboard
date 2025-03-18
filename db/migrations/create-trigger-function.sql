-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION update_distinct_query_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update both counts in normalized_queries
  UPDATE normalized_queries
  SET 
    distinct_query_count = (
      SELECT COUNT(DISTINCT query_hash)
      FROM collected_queries
      WHERE normalized_query_id = COALESCE(NEW.normalized_query_id, OLD.normalized_query_id)
    ),
    instance_count = (
      SELECT COUNT(*)
      FROM collected_queries
      WHERE normalized_query_id = COALESCE(NEW.normalized_query_id, OLD.normalized_query_id)
    )
  WHERE id = COALESCE(NEW.normalized_query_id, OLD.normalized_query_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS maintain_distinct_query_count ON collected_queries;

-- Create the trigger
CREATE TRIGGER maintain_distinct_query_count
AFTER INSERT OR UPDATE OR DELETE ON collected_queries
FOR EACH ROW
EXECUTE FUNCTION update_distinct_query_count(); 